import { useCallback, useEffect, useRef, useState } from 'react';
import { spring } from 'motion';
import { animate } from 'motion/mini';
import { invoke } from '../lib/ipc';
import { loadPlacedMedia } from '../lib/placed';
import { isVideoType, type MediaType } from '../lib/media';
import { prefersReducedMotion } from '../lib/navAnimations';
import { useMediaUrl } from '../hooks/useMediaUrl';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { useDeleteShortcut } from '../hooks/useDeleteShortcut';
import { useEditHandles } from '../hooks/useEditHandles';
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

const IMAGE_TYPES: MediaType[] = ['jpeg', 'png', 'webp', 'svg'];
// "Power-on" pop when an animation appears: from tiny to full size with one or two small bounces.
const POP_FROM_SCALE = 0.05;

/** Plays the appear animation on `el` (hidden until now). */
function popIn(el: HTMLElement) {
	el.style.opacity = '';
	if (prefersReducedMotion()) {
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
	const [rotation, setRotation] = useState(0);
	const [selected, setSelected] = useState(false);
	const [editMode, setEditMode] = useState(false);
	const [resolved, setResolved] = useState(false);
	const [frame, setFrame] = useState({
		w: window.innerWidth,
		h: window.innerHeight,
	});
	const mediaUrl = useMediaUrl(mediaId);
	const naturalRef = useRef<{ w: number; h: number } | null>(null);
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
		const onResize = () =>
			setFrame({ w: window.innerWidth, h: window.innerHeight });
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

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
			setRotation(placed.item.rotation ?? 0);
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
		naturalRef.current = { w: width, h: height };
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
	// the stored item is already reset by `reset_placed_media`; the refit restores the window size
	useTauriEvent<string>(
		'item-reset',
		(id) => {
			if (id !== instanceId) return;
			setOpacity(1);
			setPlaybackRate(1);
			setRotation(0);
			const natural = naturalRef.current;
			if (natural) {
				invoke('fit_overlay_to_media', {
					instanceId,
					naturalWidth: natural.w,
					naturalHeight: natural.h,
				});
			}
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

	// A suspended editor (app in the background) keeps the selection but shows and handles nothing.
	const editing = editMode && selected;

	useDeleteShortcut(editing, removeSelf);

	const { media, flipped, onCornerStart, onRotateStart } = useEditHandles({
		editing,
		frame,
		rotation,
		setRotation,
		naturalRef,
	});

	const select = () => {
		if (!editMode || !instanceId) return;
		invoke('select_overlay', { instanceId });
	};

	return (
		<div className="overlay-shell">
			<div
				className={
					editing ? 'overlay-media-frame selected' : 'overlay-media-frame'
				}
				data-tauri-drag-region
				onMouseDown={select}
				style={{
					width: media.w,
					height: media.h,
					transform: `rotate(${rotation}deg)`,
				}}
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
				{editing && (
					<div
						className="overlay-corner overlay-corner--tl"
						onPointerDown={(e) => onCornerStart(e, -1)}
					/>
				)}
				{editing && (
					<div
						className="overlay-corner overlay-corner--br"
						onPointerDown={(e) => onCornerStart(e, 1)}
					/>
				)}
			</div>
			{editing && (
				<div
					className={`overlay-sphere overlay-sphere--rotate${flipped ? ' is-flipped' : ''}`}
					onPointerDown={onRotateStart}
				/>
			)}
		</div>
	);
}

export default OverlayItemApp;
