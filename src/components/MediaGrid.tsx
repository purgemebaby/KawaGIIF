import { useEffect, useRef, useState } from 'react';
import { isVideoType, type MediaItem } from '../lib/media';
import { useMediaUrl } from '../hooks/useMediaUrl';
import type { SelectModifiers } from '../hooks/useMediaSelection';
import { t } from '../i18n/en';
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

const PREVIEW_STEPS = 8;
const PREVIEW_INTERVAL_MS = 700;

function formatDate(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString();
}

function MediaThumbnail({ item }: { item: MediaItem }) {
	const url = useMediaUrl(item.id);
	const videoRef = useRef<HTMLVideoElement>(null);
	const timerRef = useRef<number | null>(null);

	const startPreview = () => {
		const video = videoRef.current;
		if (!video || !video.duration || timerRef.current) return;

		let step = 1;
		timerRef.current = window.setInterval(() => {
			const v = videoRef.current;
			if (!v || !v.duration) return;
			v.currentTime = (v.duration * step) / (PREVIEW_STEPS + 1);
			step = (step % PREVIEW_STEPS) + 1;
		}, PREVIEW_INTERVAL_MS);
	};

	const stopPreview = () => {
		if (timerRef.current) {
			window.clearInterval(timerRef.current);
			timerRef.current = null;
		}
		const video = videoRef.current;
		if (video) video.currentTime = 0;
	};

	useEffect(() => stopPreview, []);

	if (!url) {
		return <div className="media-thumb" />;
	}

	if (isVideoType(item.media_type)) {
		return (
			<div
				className="media-thumb"
				onMouseEnter={startPreview}
				onMouseLeave={stopPreview}
			>
				<video ref={videoRef} src={url} muted playsInline preload="metadata" />
			</div>
		);
	}

	return (
		<div className="media-thumb">
			<img
				src={url}
				alt={item.original_file_name}
				decoding="async"
				loading="lazy"
			/>
		</div>
	);
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

	if (items.length === 0) {
		return <p className="empty-state">{t.storage.empty}</p>;
	}

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
						selectedIds.has(item.id) ? 'media-card selected' : 'media-card'
					}
					onMouseDown={(e) => e.shiftKey && e.preventDefault()}
					onClick={(e) => onCardClick(e, item.id)}
				>
					{selecting ? (
						<input
							type="checkbox"
							className="media-card-check"
							checked={selectedIds.has(item.id)}
							onChange={() => onSelect(item.id, { toggle: true, range: false })}
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

					<MediaThumbnail item={item} />

					<div className="media-card-body">
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
								onEdit={() =>
									setEditingTagsFor(editingTagsFor === item.id ? null : item.id)
								}
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
