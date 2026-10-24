import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../lib/media';
import { prefersReducedMotion } from '../lib/navAnimations';
import { useFlipGrid } from '../hooks/useFlipGrid';
import type { SelectModifiers } from '../hooks/useMediaSelection';
import { t } from '../i18n';
import MediaThumb from './MediaThumb';
import TagChips from './tags/TagChips';
import TagPopover from './tags/TagPopover';
import SketchIcon from './ui/SketchIcon';

interface MediaGridProps {
	items: MediaItem[];
	selectedIds: Set<string>;
	selecting: boolean;
	onSelect: (id: string, modifiers: SelectModifiers) => void;
	onUpdateTags: (id: string, tags: string[]) => void;
	onRename: (id: string, name: string) => void;
	onDelete: (item: MediaItem) => void;
	/** Changes whenever the filters do, so the visible cards settle once. */
	filterKey: string;
}

type CardMotion = 'is-pasting' | 'is-arriving' | 'is-settling';

function formatDate(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString();
}

// Clicks on the card's own controls (tags, delete) must not change the selection.
const isCardControl = (target: EventTarget) =>
	target instanceof Element &&
	target.closest('button, input, .tag-popover') !== null;

/** The Polaroid name: double-click turns it into an input (Enter/blur save, Esc cancels). */
function MediaName({
	name,
	onRename,
}: {
	name: string;
	onRename: (name: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(name);
	// Enter or Esc unmounts the input, which can blur it once more.
	const settled = useRef(false);

	const start = () => {
		settled.current = false;
		setDraft(name);
		setEditing(true);
	};

	const finish = (save: boolean) => {
		if (settled.current) return;
		settled.current = true;
		setEditing(false);
		const next = draft.trim();
		if (save && next && next !== name) onRename(next);
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') finish(true);
		if (e.key !== 'Escape') return;
		// Escape must not also leave select mode
		e.stopPropagation();
		finish(false);
	};

	if (editing) {
		return (
			<input
				className="media-name media-name-input"
				value={draft}
				maxLength={120}
				autoFocus
				aria-label={t.storage.renameLabel}
				onFocus={(e) => e.currentTarget.select()}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={onKeyDown}
				onBlur={() => finish(true)}
			/>
		);
	}

	return (
		<p
			className="media-name media-name-label"
			title={`${name}\n${t.storage.renameHint}`}
			onDoubleClick={start}
		>
			<span className="media-name-text">{name}</span>
			<SketchIcon name="pencil" size={12} className="media-name-hint" />
		</p>
	);
}

/** A filter change settles every card. Otherwise the newest import is pasted on and the rest fade in. */
function motionFor(
	items: MediaItem[],
	fresh: MediaItem[],
	filtered: boolean,
): Map<string, CardMotion> {
	const motion = new Map<string, CardMotion>();
	if (filtered) {
		items.forEach((item) => motion.set(item.id, 'is-settling'));
		return motion;
	}
	if (fresh.length === 0) return motion;
	const newest = fresh.reduce((best, item) =>
		item.imported_at_unix >= best.imported_at_unix ? item : best,
	);
	fresh.forEach((item) =>
		motion.set(item.id, item === newest ? 'is-pasting' : 'is-arriving'),
	);
	return motion;
}

/** One-shot card animations: classes are dropped by `clear` when the animation ends. */
function useCardMotion(items: MediaItem[], filterKey: string) {
	const [motion, setMotion] = useState(new Map<string, CardMotion>());
	const seen = useRef<Set<string> | null>(null);
	const lastFilterKey = useRef(filterKey);

	useLayoutEffect(() => {
		// The first render only fills the set, so nothing animates on first paint.
		if (!seen.current) {
			seen.current = new Set(items.map((item) => item.id));
			return;
		}
		const known = seen.current;
		const fresh = items.filter((item) => !known.has(item.id));
		fresh.forEach((item) => known.add(item.id));
		const filtered = lastFilterKey.current !== filterKey;
		lastFilterKey.current = filterKey;
		if (prefersReducedMotion()) return;

		// Cards a filter brings back are not imports.
		const next = motionFor(items, fresh, filtered);
		if (next.size > 0) setMotion((prev) => new Map([...prev, ...next]));
	}, [items, filterKey]);

	const clear = useCallback((id: string) => {
		setMotion((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Map(prev);
			next.delete(id);
			return next;
		});
	}, []);

	return { motion, clear };
}

function MediaGrid({
	items,
	selectedIds,
	selecting,
	onSelect,
	onUpdateTags,
	onRename,
	onDelete,
	filterKey,
}: MediaGridProps) {
	const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const ids = useMemo(() => items.map((item) => item.id), [items]);
	const { motion, clear } = useCardMotion(items, filterKey);
	useFlipGrid(gridRef, ids);

	const cardClass = (item: MediaItem) =>
		[
			'media-card polaroid',
			selectedIds.has(item.id) && 'selected',
			item.missing && 'is-missing',
			motion.get(item.id),
		]
			.filter(Boolean)
			.join(' ');

	const onCardClick = (e: React.MouseEvent, id: string) => {
		if (isCardControl(e.target)) return;
		onSelect(id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
	};

	return (
		<div
			ref={gridRef}
			className={selecting ? 'media-grid selecting' : 'media-grid'}
		>
			{items.map((item) => (
				<div
					key={item.id}
					data-flip-id={item.id}
					className={cardClass(item)}
					// Animations of the card's children bubble up too.
					onAnimationEnd={(e) => e.target === e.currentTarget && clear(item.id)}
					onMouseDown={(e) => e.shiftKey && e.preventDefault()}
					onClick={(e) => onCardClick(e, item.id)}
				>
					<div className="polaroid-photo">
						<MediaThumb item={item} preview alt={item.original_file_name} />

						{item.missing && (
							<span
								className="polaroid-missing"
								title={t.storage.missingFileHint}
							>
								{t.storage.missingFile}
							</span>
						)}

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
						<MediaName
							name={item.original_file_name}
							onRename={(name) => onRename(item.id, name)}
						/>
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
