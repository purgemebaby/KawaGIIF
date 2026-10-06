import { useCallback, useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';
import { useTauriEvent } from '../hooks/useTauriEvent';
import type { MediaType } from '../lib/media';
import { t } from '../i18n/en';

interface PlacedItemSummary {
	instance_id: string;
	media_id: string;
	original_file_name: string;
	media_type: MediaType;
	selected: boolean;
}

function PlacedItemsList() {
	const [items, setItems] = useState<PlacedItemSummary[]>([]);

	const refresh = useCallback(async () => {
		setItems(await invoke<PlacedItemSummary[]>('list_placed_items'));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useTauriEvent('placed-items-changed', refresh);
	useTauriEvent('selection-changed', refresh);

	return (
		<div className="placed-items">
			<h2>{t.editor.placedTitle}</h2>
			{items.length === 0 ? (
				<p className="empty-state">{t.editor.placedEmpty}</p>
			) : (
				<ul className="placed-items-list">
					{items.map((item) => (
						<li
							key={item.instance_id}
							className={item.selected ? 'placed-item selected' : 'placed-item'}
						>
							<button
								type="button"
								className="placed-item-select"
								onClick={() =>
									invoke('select_overlay', { instanceId: item.instance_id })
								}
								title={item.original_file_name}
							>
								<span className="placed-item-type">
									{item.media_type.toUpperCase()}
								</span>
								<span className="placed-item-name">
									{item.original_file_name}
								</span>
							</button>
							<button
								type="button"
								className="placed-item-remove"
								onClick={() =>
									invoke('remove_placed_media', {
										instanceId: item.instance_id,
									})
								}
								aria-label={t.editor.removeItem}
								title={t.editor.removeItem}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default PlacedItemsList;
