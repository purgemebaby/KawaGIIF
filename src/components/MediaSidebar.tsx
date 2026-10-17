import { invoke } from '../lib/ipc';
import { isVideoType, type MediaItem } from '../lib/media';
import { useLibrary } from '../context/LibraryProvider';
import { useMediaUrl } from '../hooks/useMediaUrl';
import { t } from '../i18n/en';

// Moving farther than this with the button held turns a click into a drag.
const DRAG_THRESHOLD_PX = 5;

function SidebarThumb({ item }: { item: MediaItem }) {
	const url = useMediaUrl(item.id);

	if (!url) {
		return (
			<div className="sidebar-thumb sidebar-thumb-placeholder">
				{item.media_type.toUpperCase()}
			</div>
		);
	}
	if (isVideoType(item.media_type)) {
		return (
			<video
				className="sidebar-thumb"
				src={url}
				muted
				playsInline
				preload="metadata"
			/>
		);
	}
	return (
		<img
			className="sidebar-thumb"
			src={url}
			alt=""
			draggable={false}
			decoding="async"
			loading="lazy"
		/>
	);
}

interface SpawnedOverlay {
	instance_id: string;
	window_label: string;
}

type SpawnAt = { kind: 'center'; monitor: number } | { kind: 'cursor' };

function spawn(mediaId: string, at: SpawnAt) {
	return invoke<SpawnedOverlay>('spawn_placed_media', { mediaId, at });
}

// A click places the animation in the middle of the target monitor; a drag picks it up and carries it under the cursor.
function MediaSidebar({ targetMonitor }: { targetMonitor: number }) {
	const { items } = useLibrary();

	const onMouseDown = (e: React.MouseEvent, mediaId: string) => {
		if (e.button !== 0) return;
		e.preventDefault();
		const start = { x: e.clientX, y: e.clientY };

		const stop = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		const onUp = () => {
			stop();
			spawn(mediaId, { kind: 'center', monitor: targetMonitor });
		};
		// Rust carries the new overlay under the cursor until the button is released.
		const onMove = (move: MouseEvent) => {
			const distance = Math.hypot(
				move.clientX - start.x,
				move.clientY - start.y,
			);
			if (distance < DRAG_THRESHOLD_PX) return;
			stop();
			spawn(mediaId, { kind: 'cursor' });
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	};

	// The wheel scrolls the strip sideways, since it has no vertical overflow.
	return (
		<div
			className="media-strip"
			onWheel={(e) => {
				e.currentTarget.scrollLeft += e.deltaY;
			}}
		>
			{items.length === 0 && (
				<p className="empty-state">{t.editor.sidebarEmpty}</p>
			)}
			{items.map((item) => (
				<div
					key={item.id}
					className="media-strip-item"
					onMouseDown={(e) => onMouseDown(e, item.id)}
					title={t.editor.sidebarHint}
				>
					<SidebarThumb item={item} />
					<span>{item.original_file_name}</span>
				</div>
			))}
		</div>
	);
}

export default MediaSidebar;
