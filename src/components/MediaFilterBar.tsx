import { t } from '../i18n/en';
import SortMenu from './ui/SortMenu';
import type { MediaFilters, SortMode } from '../lib/mediaFilter';
import { tagStyle } from '../lib/tags';

export { DEFAULT_FILTERS } from '../lib/mediaFilter';
export type { MediaFilters, SortMode } from '../lib/mediaFilter';

interface MediaFilterBarProps {
	filters: MediaFilters;
	onChange: (filters: MediaFilters) => void;
	onOpenTags: () => void;
	compact?: boolean;
}

const TYPE_OPTIONS: { value: MediaFilters['type']; label: string }[] = [
	{ value: 'all', label: t.storage.types.all },
	{ value: 'gif', label: t.storage.types.gif },
	{ value: 'mp4', label: t.storage.types.mp4 },
	{ value: 'jpeg', label: t.storage.types.jpeg },
	{ value: 'png', label: t.storage.types.png },
	{ value: 'webp', label: t.storage.types.webp },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
	{ value: 'date-new', label: t.storage.sort.dateNew },
	{ value: 'date-old', label: t.storage.sort.dateOld },
	{ value: 'name-asc', label: t.storage.sort.nameAsc },
	{ value: 'name-desc', label: t.storage.sort.nameDesc },
];

function MediaFilterBar({
	filters,
	onChange,
	onOpenTags,
	compact,
}: MediaFilterBarProps) {
	return (
		<div className={compact ? 'filter-bar filter-bar--compact' : 'filter-bar'}>
			<div className="filter-row">
				{!compact && (
					<div className="filter-types">
						{TYPE_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								className={
									filters.type === opt.value
										? 'filter-type active'
										: 'filter-type'
								}
								aria-pressed={filters.type === opt.value}
								onClick={() => onChange({ ...filters, type: opt.value })}
							>
								{opt.label}
							</button>
						))}
					</div>
				)}

				<input
					className="filter-search"
					placeholder={t.storage.search}
					value={filters.query}
					onChange={(e) => onChange({ ...filters, query: e.target.value })}
				/>

				<SortMenu
					value={filters.sort}
					options={SORT_OPTIONS}
					label={t.storage.sort.label}
					onChange={(sort) => onChange({ ...filters, sort })}
				/>

				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm"
					onClick={onOpenTags}
				>
					{t.tags.label}
					{filters.tags.length > 0 && (
						<span className="filter-tag-count">{filters.tags.length}</span>
					)}
				</button>
			</div>

			{filters.tags.length > 0 && (
				<div className="active-filters">
					{filters.tags.map((tag) => (
						<button
							key={tag}
							type="button"
							className="kg-pill active"
							title={t.tags.removeFilter(tag)}
							style={tagStyle(tag)}
							onClick={() =>
								onChange({
									...filters,
									tags: filters.tags.filter((x) => x !== tag),
								})
							}
						>
							{tag}
							<span aria-hidden="true">×</span>
						</button>
					))}
					<button
						type="button"
						className="kg-btn kg-btn--ghost kg-btn--sm"
						onClick={() => onChange({ ...filters, tags: [] })}
					>
						{t.tags.clearFilters}
					</button>
				</div>
			)}
		</div>
	);
}

export default MediaFilterBar;
