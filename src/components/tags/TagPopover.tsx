import { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../../context/LibraryProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { t } from '../../i18n';
import { cleanTag, MAX_TAG_LENGTH, tagStyle } from '../../lib/tags';

interface TagPopoverProps {
	tags: string[];
	onChange: (next: string[]) => void;
	onClose: () => void;
}

function TagPopover({ tags, onChange, onClose }: TagPopoverProps) {
	const { tags: allTags } = useLibrary();
	const [draft, setDraft] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useDismiss(rootRef, true, onClose);

	const suggestions = useMemo(() => {
		const query = draft.trim().toLowerCase();
		const already = new Set(tags.map((tag) => tag.toLowerCase()));
		return allTags
			.filter((tag) => !already.has(tag.name.toLowerCase()))
			.filter((tag) => query === '' || tag.name.toLowerCase().includes(query))
			.slice(0, 6);
	}, [allTags, draft, tags]);

	const add = (raw: string) => {
		const cleaned = cleanTag(raw);
		if (!cleaned) return;
		if (tags.some((tag) => tag.toLowerCase() === cleaned.toLowerCase())) {
			setDraft('');
			return;
		}
		onChange([...tags, cleaned]);
		setDraft('');
	};

	const remove = (tag: string) => {
		onChange(tags.filter((existing) => existing !== tag));
	};

	return (
		<div
			className="tag-popover"
			ref={rootRef}
			role="dialog"
			aria-label={t.tags.edit}
		>
			<h4 className="tag-popover-title">{t.tags.label}</h4>

			{tags.length === 0 && <p className="tag-popover-empty">{t.tags.none}</p>}

			<div className="tag-popover-list">
				{tags.map((tag) => (
					<span
						key={tag}
						className="tag-chip tag-chip-editable"
						title={tag}
						style={tagStyle(tag)}
					>
						{tag}
						<button
							type="button"
							className="tag-chip-remove"
							onClick={() => remove(tag)}
							aria-label={t.tags.remove(tag)}
						>
							×
						</button>
					</span>
				))}
			</div>

			<input
				ref={inputRef}
				className="tag-popover-input"
				value={draft}
				placeholder={t.tags.add}
				maxLength={MAX_TAG_LENGTH}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						add(draft);
					}
				}}
			/>

			{suggestions.length > 0 && (
				<div className="tag-popover-suggestions">
					{suggestions.map((tag) => (
						<button
							key={tag.name}
							type="button"
							className="tag-suggestion"
							onClick={() => add(tag.name)}
						>
							{tag.name}
							<span className="tag-suggestion-count">{tag.count}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export default TagPopover;
