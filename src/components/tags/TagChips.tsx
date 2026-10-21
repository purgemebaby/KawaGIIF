import { t } from '../../i18n/en';
import { tagStyle } from '../../lib/tags';

interface TagChipsProps {
	tags: string[];
	onRemove: (tag: string) => void;
	onAdd: () => void;
}

function TagChips({ tags, onRemove, onAdd }: TagChipsProps) {
	return (
		<div className="tag-chips">
			{tags.map((tag) => (
				<span
					key={tag}
					className="tag-chip tag-tape"
					title={tag}
					style={tagStyle(tag)}
				>
					{tag}
					<button
						type="button"
						className="tag-chip-x"
						onClick={() => onRemove(tag)}
						aria-label={t.tags.remove(tag)}
					>
						×
					</button>
				</span>
			))}
			<button
				type="button"
				className="tag-chip tag-chip-add"
				onClick={onAdd}
				aria-label={t.tags.add}
			>
				+
			</button>
		</div>
	);
}

export default TagChips;
