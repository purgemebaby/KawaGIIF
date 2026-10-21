import { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../../context/LibraryProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { t } from '../../i18n/en';
import type { MediaItem } from '../../lib/media';
import { cleanTag, MAX_TAG_LENGTH, tagStyle } from '../../lib/tags';

interface BulkTagPopoverProps {
	items: MediaItem[];
	onApply: (add: string[], remove: string[]) => void;
	onClose: () => void;
}

function BulkTagPopover({ items, onApply, onClose }: BulkTagPopoverProps) {
	const { tags } = useLibrary();
	const [query, setQuery] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useDismiss(rootRef, true, onClose);

	// Lowercased tag -> how many of the selected files carry it, for the tri-state boxes.
	const counts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const tag of items.flatMap((item) => item.tags)) {
			const key = tag.toLowerCase();
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return counts;
	}, [items]);

	const rows = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return tags.filter((tag) => tag.name.toLowerCase().includes(needle));
	}, [tags, query]);

	// The input doubles as the "new tag" field: Enter creates the typed tag on all.
	const createTag = () => {
		const cleaned = cleanTag(query);
		if (!cleaned) return;
		onApply([cleaned], []);
		setQuery('');
	};

	return (
		<div
			className="tag-popover bulk-tag-popover"
			ref={rootRef}
			role="dialog"
			aria-label={t.tags.label}
		>
			<h4 className="tag-popover-title">{t.tags.label}</h4>
			<p className="bulk-tag-hint">{t.tags.bulk.hint}</p>

			<input
				ref={inputRef}
				className="tag-popover-input"
				value={query}
				placeholder={t.tags.bulk.placeholder}
				maxLength={MAX_TAG_LENGTH}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						createTag();
					}
				}}
			/>

			<div className="bulk-tag-list">
				{rows.map((tag) => {
					const count = counts.get(tag.name.toLowerCase()) ?? 0;
					const state =
						count === 0 ? 'none' : count === items.length ? 'all' : 'some';
					return (
						<button
							key={tag.name}
							type="button"
							role="menuitemcheckbox"
							aria-checked={
								state === 'all' ? true : state === 'some' ? 'mixed' : false
							}
							className="bulk-tag-row"
							onClick={() =>
								state === 'all'
									? onApply([], [tag.name])
									: onApply([tag.name], [])
							}
						>
							<span
								className={
									state === 'none'
										? 'bulk-tag-box'
										: `bulk-tag-box bulk-tag-box--${state}`
								}
								aria-hidden="true"
							>
								{state === 'all' ? '✓' : state === 'some' ? '–' : ''}
							</span>
							<span
								className="bulk-tag-dot"
								style={tagStyle(tag.name)}
								aria-hidden="true"
							/>
							<span className="bulk-tag-name">{tag.name}</span>
							<span className="tag-suggestion-count">{tag.count}</span>
						</button>
					);
				})}
				{rows.length === 0 && (
					<p className="tag-popover-empty">
						{tags.length === 0 ? t.tags.manageEmpty : t.tags.noMatches}
					</p>
				)}
			</div>
		</div>
	);
}

export default BulkTagPopover;
