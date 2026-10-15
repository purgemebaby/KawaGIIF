import { useCallback, useEffect, useRef, useState } from 'react';
import { spring } from 'motion';
import { animate } from 'motion/mini';
import { invoke } from '../lib/ipc';
import { loadPlacedMedia } from '../lib/placed';
import { isVideoType, type MediaType } from '../lib/media';
import { useMediaUrl } from '../hooks/useMediaUrl';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { useDeleteShortcut } from '../hooks/useDeleteShortcut';
import { POP_BOUNCE, POP_SECONDS, useSwing } from '../hooks/useSwing';
import GifCanvasPlayer from '../components/GifCanvasPlayer';
import './OverlayItemApp.css';

interface ItemValueChanged<T> {
	instance_id: string;
	value: T;
}

interface EditorStatus {
	edit_mode: boolean;
	selected: string | null;
}

interface SlotInfo {
	instance_id: string;
	arrival: 'reload' | 'pop' | 'carried';
}

const MIN_SIDE = 40;
const IMAGE_TYPES: MediaType[] = ['jpeg', 'png', 'webp', 'svg'];
// "Power-on" pop when an animation appears: from tiny to full size with one or two small bounces.
const POP_FROM_SCALE = 0.05;

/** Plays the appear animation on `el` (hidden until now). */
function popIn(el: HTMLElement) {
	el.style.opacity = '';
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		animate(el, { opacity: [0, 1] }, { duration: 0.2 });
		return;
	}
	animate(
		el,
		{ transform: [`scale(${POP_FROM_SCALE})`, 'scale(1)'] },
		{ type: spring, bounce: POP_BOUNCE, visualDuration: POP_SECONDS },
	);
	animate(el, { opacity: [0, 1] }, { duration: POP_SECONDS / 3 });
}

function OverlayItemApp() {
	const [instanceId, setInstanceId] = useState<string | null>(null);
	const [mediaType, setMediaType] = useState<MediaType | null>(null);
	const [mediaId, setMediaId] = useState<string | null>(null);
	const [opacity, setOpacity] = useState(1);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [selected, setSelected] = useState(false);
	const [editMode, setEditMode] = useState(false);
	const [resolved, setResolved] = useState(false);
	const mediaUrl = useMediaUrl(mediaId);
	const aspectRef = useRef<number | null>(null);
	const mediaWrapRef = useRef<HTMLDivElement>(null);
	const popRef = useRef<HTMLDivElement>(null);
	const popPending = useRef(false);
	const { carrying, start: startSwing } = useSwing(mediaWrapRef);

	// Asked, not pushed: a sleeping slot misses the events sent while it wakes, and it asks several times while waking.
	// The entrance plays once per new instance; editor reloads arrive as `reload`: no entrance.
	const entranceFor = useRef<string | null>(null);
	const resolveSlot = useCallback(() => {
		invoke<SlotInfo | null>('get_slot_info').then((info) => {
			setResolved(true);
			if (!info) {
				entranceFor.current = null;
				setInstanceId(null);
				return;
			}
			if (entranceFor.current !== info.instance_id) {
				entranceFor.current = info.instance_id;
				popPending.current = info.arrival !== 'reload';
				if (popPending.current && popRef.current)
					popRef.current.style.opacity = '0';
				if (info.arrival === 'carried') startSwing();
			}
			setInstanceId(info.instance_id);
		});
	}, [startSwing]);

	useEffect(() => {
		resolveSlot();
		const onVisibility = () => {
			if (document.visibilityState === 'visible') resolveSlot();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, [resolveSlot]);

	useTauriEvent('slot-assigned', resolveSlot, 'self');
	useTauriEvent(
		'slot-released',
		() => {
			entranceFor.current = null;
			setInstanceId(null);
		},
		'self',
	);

	useEffect(() => {
		if (resolved && !instanceId) invoke('overlay_idle');
	}, [resolved, instanceId]);

	useEffect(() => {
		if (!instanceId) {
			setMediaId(null);
			setMediaType(null);
			return;
		}
		let cancelled = false;
		loadPlacedMedia(instanceId).then((placed) => {
			if (cancelled || !placed) return;
			setOpacity(placed.item.opacity);
			setPlaybackRate(placed.item.playback_rate ?? 1);
			setMediaId(placed.item.media_id);
			setMediaType(placed.mediaType);
		});
		return () => {
			cancelled = true;
		};
	}, [instanceId]);

	// Media that fails or reports no size never gets an entrance: show it plainly instead of staying hidden.
	const revealMedia = () => {
		popPending.current = false;
		if (popRef.current) popRef.current.style.opacity = '';
	};

	const reportNaturalSize = (width: number, height: number) => {
		if (!width || !height) {
			revealMedia();
			return;
		}
		aspectRef.current = width / height;
		if (popPending.current && popRef.current) {
			// a carried item is already shown small by the swing: it grows at the drop, not here
			if (carrying.current) revealMedia();
			else {
				popPending.current = false;
				popIn(popRef.current);
			}
		}
		if (!instanceId) return;
		invoke('fit_overlay_to_media', {
			instanceId,
			naturalWidth: width,
			naturalHeight: height,
		});
	};

	useTauriEvent<ItemValueChanged<number>>(
		'item-opacity-changed',
		(payload) => {
			if (payload.instance_id === instanceId) setOpacity(payload.value);
		},
		'self',
	);
	useTauriEvent<ItemValueChanged<number>>(
		'item-playback-rate-changed',
		(payload) => {
			if (payload.instance_id === instanceId) setPlaybackRate(payload.value);
		},
		'self',
	);
	useTauriEvent<boolean>('edit-mode-changed', setEditMode, 'self');
	useTauriEvent<string | null>('selection-changed', (payload) => {
		setSelected(payload !== null && payload === instanceId);
	});

	useEffect(() => {
		let cancelled = false;
		invoke<EditorStatus>('get_editor_status').then((status) => {
			if (cancelled) return;
			setEditMode(status.edit_mode);
			setSelected(status.selected !== null && status.selected === instanceId);
		});
		return () => {
			cancelled = true;
		};
	}, [instanceId]);

	const removeSelf = useCallback(() => {
		if (instanceId) invoke('remove_placed_media', { instanceId });
	}, [instanceId]);

	useDeleteShortcut(selected, removeSelf);

	useEffect(() => {
		if (!selected) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const step = e.shiftKey ? 10 : 1;
			let dx = 0;
			let dy = 0;
			if (e.key === 'ArrowLeft') dx = -step;
			else if (e.key === 'ArrowRight') dx = step;
			else if (e.key === 'ArrowUp') dy = -step;
			else if (e.key === 'ArrowDown') dy = step;
			else return;
			e.preventDefault();
			invoke('nudge_overlay', { dx, dy });
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [selected]);

	const select = () => {
		if (instanceId) invoke('select_overlay', { instanceId });
	};

	const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
		e.stopPropagation();
		e.preventDefault();

		const handle: HTMLDivElement = e.currentTarget;
		const pointerId = e.pointerId;
		const startX = e.screenX;
		const startY = e.screenY;

		handle.setPointerCapture(pointerId);

		const scale = window.devicePixelRatio || 1;
		const startWidth = Math.round(window.innerWidth * scale);
		const startHeight = Math.round(window.innerHeight * scale);
		const lockAspect = isVideoType(mediaType);
		const aspect = aspectRef.current ?? startWidth / startHeight;

		let pendingW = startWidth;
		let pendingH = startHeight;
		let frame = 0;

		const flush = () => {
			frame = 0;
			invoke('resize_overlay', { width: pendingW, height: pendingH });
		};

		const onMove = (moveEvent: PointerEvent) => {
			const dx = moveEvent.screenX - startX;
			const dy = moveEvent.screenY - startY;

			if (lockAspect) {
				const driven =
					Math.abs(dx) >= Math.abs(dy)
						? startWidth + dx
						: (startHeight + dy) * aspect;
				pendingW = Math.max(MIN_SIDE, Math.round(driven));
				pendingH = Math.max(MIN_SIDE, Math.round(pendingW / aspect));
			} else {
				pendingW = Math.max(MIN_SIDE, Math.round(startWidth + dx));
				pendingH = Math.max(MIN_SIDE, Math.round(startHeight + dy));
			}

			if (!frame) frame = requestAnimationFrame(flush);
		};

		const onUp = () => {
			if (frame) {
				cancelAnimationFrame(frame);
				flush();
			}
			if (handle.hasPointerCapture(pointerId)) {
				handle.releasePointerCapture(pointerId);
			}
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
		};
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	};

	return (
		<div
			className={selected ? 'overlay-shell selected' : 'overlay-shell'}
			data-tauri-drag-region
			onMouseDown={select}
		>
			<div
				ref={mediaWrapRef}
				className="overlay-media-wrap"
				style={{ opacity }}
			>
				<div ref={popRef} className="overlay-media-pop">
					{mediaUrl && isVideoType(mediaType) && (
						<video
							src={mediaUrl}
							autoPlay
							loop
							muted
							playsInline
							onError={revealMedia}
							onLoadedMetadata={(e) =>
								reportNaturalSize(
									e.currentTarget.videoWidth,
									e.currentTarget.videoHeight,
								)
							}
							ref={(el) => {
								if (el) el.playbackRate = playbackRate;
							}}
						/>
					)}
					{mediaUrl && mediaType === 'gif' && (
						<GifCanvasPlayer
							src={mediaUrl}
							speedMultiplier={playbackRate}
							className="overlay-media"
							onNaturalSize={reportNaturalSize}
						/>
					)}
					{mediaUrl && mediaType && IMAGE_TYPES.includes(mediaType) && (
						<img
							src={mediaUrl}
							alt=""
							draggable={false}
							onError={revealMedia}
							onLoad={(e) =>
								reportNaturalSize(
									e.currentTarget.naturalWidth,
									e.currentTarget.naturalHeight,
								)
							}
						/>
					)}
				</div>
			</div>
			{editMode && selected && (
				<div className="resize-handle" onPointerDown={onResizeStart} />
			)}
		</div>
	);
}

export default OverlayItemApp;
