import { Window } from '@tauri-apps/api/window';
import { invoke } from '../lib/ipc';
import { isVideoType, type MediaItem } from '../lib/media';
import { useLibrary } from '../context/LibraryProvider';
import { useMediaUrl } from '../hooks/useMediaUrl';
import { t } from '../i18n/en';

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
	return <img className="sidebar-thumb" src={url} alt="" draggable={false} />;
}

interface SpawnedOverlay {
	instance_id: string;
	window_label: string;
}

function MediaSidebar() {
	const { items } = useLibrary();

	const onMouseDown = async (e: React.MouseEvent, mediaId: string) => {
		e.preventDefault();
		const spawned = await invoke<SpawnedOverlay>('spawn_placed_media', {
			mediaId,
		});
		const handle = await Window.getByLabel(spawned.window_label);
		await handle?.startDragging();
	};

	return (
		<div className="media-sidebar">
			<h2>{t.editor.sidebarTitle}</h2>
			<div className="media-sidebar-list">
				{items.length === 0 && (
					<p className="empty-state">{t.editor.sidebarEmpty}</p>
				)}
				{items.map((item) => (
					<div
						key={item.id}
						className="media-sidebar-item"
						onMouseDown={(e) => onMouseDown(e, item.id)}
						title={t.editor.sidebarHint}
					>
						<SidebarThumb item={item} />
						<span>{item.original_file_name}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export default MediaSidebar;
