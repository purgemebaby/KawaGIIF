import { useCallback, useState } from 'react';
import { useTauriEvent } from './useTauriEvent';

export function useEditorSync() {
	const [movedInstanceIds, setMovedInstanceIds] = useState<Set<string>>(
		new Set(),
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	useTauriEvent<string>('overlay-geometry-changed', (id) => {
		setMovedInstanceIds((prev) => new Set(prev).add(id));
	});
	useTauriEvent<string | null>('selection-changed', setSelectedId);

	const resetMoved = useCallback(() => setMovedInstanceIds(new Set()), []);

	return { movedInstanceIds, selectedId, resetMoved };
}
