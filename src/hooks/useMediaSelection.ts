import { useCallback, useEffect, useState } from 'react';

export interface SelectModifiers {
	toggle: boolean;
	range: boolean;
}

// Several selected files, like a file explorer: Ctrl toggles one, Shift selects a range from the last clicked one.
export function useMediaSelection(existingIds: string[]) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [anchorId, setAnchorId] = useState<string | null>(null);

	// Forget files that were deleted meanwhile.
	useEffect(() => {
		const existing = new Set(existingIds);
		setSelectedIds((prev) => {
			const kept = [...prev].filter((id) => existing.has(id));
			return kept.length === prev.size ? prev : new Set(kept);
		});
	}, [existingIds]);

	const select = useCallback(
		(id: string, { toggle, range }: SelectModifiers, orderedIds: string[]) => {
			const from = anchorId ? orderedIds.indexOf(anchorId) : -1;
			if (range && from !== -1) {
				const to = orderedIds.indexOf(id);
				const span = orderedIds.slice(
					Math.min(from, to),
					Math.max(from, to) + 1,
				);
				setSelectedIds((prev) => new Set(toggle ? [...prev, ...span] : span));
				return;
			}
			setAnchorId(id);
			if (!toggle) {
				setSelectedIds(new Set([id]));
				return;
			}
			setSelectedIds((prev) => {
				const next = new Set(prev);
				if (!next.delete(id)) next.add(id);
				return next;
			});
		},
		[anchorId],
	);

	const selectAll = useCallback(
		(ids: string[]) => setSelectedIds(new Set(ids)),
		[],
	);
	const clear = useCallback(() => setSelectedIds(new Set()), []);

	return { selectedIds, select, selectAll, clear };
}
