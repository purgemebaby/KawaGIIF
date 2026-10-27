import { invoke } from '../lib/ipc';
import { notifyError } from '../lib/notify';
import { useLibrary } from '../context/LibraryProvider';
import { useImportFlow } from './ImportDialogs';
import { useMediaFilters } from '../hooks/useMediaFilters';
import { t } from '../i18n';
import MediaFilterBar from './MediaFilterBar';
import MediaThumb from './MediaThumb';
import TagManager from './tags/TagManager';

// Moving farther than this with the button held picks the animation up. A plain click does nothing.
const DRAG_THRESHOLD_PX = 5;

interface SpawnedOverlay {
	instance_id: string;
	window_label: string;
}

function spawn(mediaId: string) {
	return invoke<SpawnedOverlay>('spawn_placed_media', { mediaId });
}

// Only a drag places the animation: the new overlay is carried under the cursor until the button is released.
// `wrap` turns the strip into the scrolling grid of a panel sized taller than one row.
function MediaSidebar({ wrap = false }: { wrap?: boolean }) {
	const { items } = useLibrary();
	const { startImport, dropping, dialogs } = useImportFlow({
		toastNotices: true,
	});
	const {
		filters,
		setFilters,
		filtered: filteredItems,
		managingTags,
		openTags,
		closeTags,
		toggleTag,
	} = useMediaFilters(items);

	const onMouseDown = (e: React.MouseEvent, mediaId: string) => {
		if (e.button !== 0) return;
		e.preventDefault();
		const start = { x: e.clientX, y: e.clientY };

		const stop = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', stop);
		};
		// Rust carries the new overlay under the cursor until the button is released.
		const onMove = (move: MouseEvent) => {
			const distance = Math.hypot(
				move.clientX - start.x,
				move.clientY - start.y,
			);
			if (distance < DRAG_THRESHOLD_PX) return;
			stop();
			spawn(mediaId).catch(notifyError);
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', stop);
	};

	// The single row has no vertical overflow, so the wheel scrolls it sideways. The grid scrolls natively.
	const onWheel = wrap
		? undefined
		: (e: React.WheelEvent<HTMLDivElement>) => {
				e.currentTarget.scrollLeft += e.deltaY;
			};

	return (
		<div
			className={`media-sidebar kg-drop-zone${dropping ? ' is-dropping' : ''}`}
			data-drop-hint={t.storage.dropHint}
		>
			<div className="media-sidebar-toolbar">
				<MediaFilterBar
					compact
					filters={filters}
					onChange={setFilters}
					onOpenTags={openTags}
				/>
				<button
					type="button"
					className="kg-btn kg-btn--primary kg-btn--sm"
					onClick={startImport}
				>
					{t.storage.import}
				</button>
			</div>

			{items.length > 0 && filteredItems.length === 0 ? (
				<p className="empty-state">{t.editor.sidebarNoMatches}</p>
			) : (
				<div
					className={wrap ? 'media-strip media-strip--grid' : 'media-strip'}
					onWheel={onWheel}
				>
					{items.length === 0 && (
						<p className="empty-state">{t.editor.sidebarEmpty}</p>
					)}
					{filteredItems.map((item) => (
						<div
							key={item.id}
							className="media-strip-item"
							onMouseDown={(e) => onMouseDown(e, item.id)}
							title={t.editor.sidebarHint}
						>
							<MediaThumb
								item={item}
								className="sidebar-thumb"
								placeholderLabel
							/>
							<span>{item.original_file_name}</span>
						</div>
					))}
				</div>
			)}

			{managingTags && (
				<TagManager
					activeFilters={filters.tags}
					onToggleFilter={toggleTag}
					onClose={closeTags}
				/>
			)}

			{dialogs}
		</div>
	);
}

export default MediaSidebar;
