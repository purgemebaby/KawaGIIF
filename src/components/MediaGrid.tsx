import { useState } from 'react';
import type { MediaItem } from '../lib/media';
import type { SelectModifiers } from '../hooks/useMediaSelection';
import { t } from '../i18n/en';
import MediaThumb from './MediaThumb';
import TagChips from './tags/TagChips';
import TagPopover from './tags/TagPopover';

interface MediaGridProps {
	items: MediaItem[];
	selectedIds: Set<string>;
	selecting: boolean;
	onSelect: (id: string, modifiers: SelectModifiers) => void;
	onUpdateTags: (id: string, tags: string[]) => void;
	onDelete: (item: MediaItem) => void;
}

function formatDate(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString();
}

// Clicks on the card's own controls (tags, delete) must not change the selection.
const isCardControl = (target: EventTarget) =>
	target instanceof Element &&
	target.closest('button, input, .tag-popover') !== null;

function MediaGrid({
	items,
	selectedIds,
	selecting,
	onSelect,
	onUpdateTags,
	onDelete,
}: MediaGridProps) {
	const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);

	const onCardClick = (e: React.MouseEvent, id: string) => {
		if (isCardControl(e.target)) return;
		onSelect(id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
	};

	return (
		<div className={selecting ? 'media-grid selecting' : 'media-grid'}>
			{items.map((item) => (
				<div
					key={item.id}
					className={
						selectedIds.has(item.id)
							? 'media-card polaroid selected'
							: 'media-card polaroid'
					}
					onMouseDown={(e) => e.shiftKey && e.preventDefault()}
					onClick={(e) => onCardClick(e, item.id)}
				>
					<div className="polaroid-photo">
						<MediaThumb item={item} preview alt={item.original_file_name} />

						{selecting ? (
							<input
								type="checkbox"
								className="media-card-check"
								checked={selectedIds.has(item.id)}
								onChange={() =>
									onSelect(item.id, { toggle: true, range: false })
								}
								aria-label={t.storage.select.toggle(item.original_file_name)}
							/>
						) : (
							<button
								type="button"
								className="media-card-delete"
								onClick={() => onDelete(item)}
								aria-label={t.common.delete}
								title={t.common.delete}
							>
								×
							</button>
						)}
					</div>

					<div className="polaroid-caption">
						<p className="media-name" title={item.original_file_name}>
							{item.original_file_name}
						</p>
						<p className="media-meta">
							{item.media_type.toUpperCase()} ·{' '}
							{formatDate(item.imported_at_unix)}
						</p>

						<div className="media-card-tags">
							<TagChips
								tags={item.tags}
								onRemove={(tag) =>
									onUpdateTags(
										item.id,
										item.tags.filter((existing) => existing !== tag),
									)
								}
								onAdd={() => setEditingTagsFor(item.id)}
							/>
							{editingTagsFor === item.id && (
								<TagPopover
									tags={item.tags}
									onChange={(tags) => onUpdateTags(item.id, tags)}
									onClose={() => setEditingTagsFor(null)}
								/>
							)}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

export default MediaGrid;
