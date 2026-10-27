import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '../lib/ipc';
import { notifyError } from '../lib/notify';
import { loadConfig } from '../lib/config';
import { shortFileName, type MediaItem } from '../lib/media';
import { useLibrary } from '../context/LibraryProvider';
import { useDeleteShortcut } from '../hooks/useDeleteShortcut';
import { useEscape } from '../hooks/useDismiss';
import {
	useMediaSelection,
	type SelectModifiers,
} from '../hooks/useMediaSelection';
import { useImportCount } from '../hooks/useImportCount';
import { useMascotShown } from '../hooks/useMascotShown';
import { t } from '../i18n';
import { useMediaFilters } from '../hooks/useMediaFilters';
import MediaFilterBar from './MediaFilterBar';
import EmptyLibraryMascot from './mascot/EmptyLibraryMascot';
import LibraryMascot from './mascot/LibraryMascot';
import MediaGrid from './MediaGrid';
import { useImportFlow } from './ImportDialogs';
import BulkTagPopover from './tags/BulkTagPopover';
import TagManager from './tags/TagManager';
import Modal from './ui/Modal';
import SketchIcon from './ui/SketchIcon';
import WaveText from './brand/WaveText';
import './StorageScreen.css';

interface DeleteRequest {
	ids: string[];
	placed: number;
}

function StorageScreen() {
	const {
		items,
		loading,
		importNotices,
		dismissImportNotices,
		renameMedia,
		updateTags,
		updateTagsMany,
		deleteMedia,
	} = useLibrary();
	const { startImport, dropping, dialogs } = useImportFlow();
	const showMascot = useMascotShown();
	const imports = useImportCount(items, loading);
	const {
		filters,
		setFilters,
		filtered: filteredItems,
		managingTags,
		openTags,
		closeTags,
		toggleTag,
	} = useMediaFilters(items);
	const [deleting, setDeleting] = useState<DeleteRequest | null>(null);
	const [confirmBeforeDelete, setConfirmBeforeDelete] = useState(true);
	const [selecting, setSelecting] = useState(false);
	const [bulkTags, setBulkTags] = useState(false);
	const itemIds = useMemo(() => items.map((item) => item.id), [items]);
	const { selectedIds, select, selectAll, clear } = useMediaSelection(itemIds);
	const selectedItems = useMemo(
		() => items.filter((item) => selectedIds.has(item.id)),
		[items, selectedIds],
	);

	useEffect(() => {
		loadConfig().then((cfg) =>
			setConfirmBeforeDelete(cfg.confirm_media_delete),
		);
	}, []);

	const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

	// Files on the desktop always ask first, even with confirmation turned off in Settings.
	const requestDelete = useCallback(
		async (ids: string[]) => {
			if (ids.length === 0) return;
			let placed = 0;
			try {
				placed = await invoke<number>('count_placed_media', { ids });
			} catch (e) {
				// Unknown placed count: don't delete anything unasked.
				notifyError(e);
				return;
			}
			if (confirmBeforeDelete || placed > 0) {
				setDeleting({ ids, placed });
			} else {
				await deleteMedia(ids);
			}
		},
		[confirmBeforeDelete, deleteMedia],
	);

	const confirmDelete = async (request: DeleteRequest) => {
		setDeleting(null);
		await deleteMedia(request.ids, true);
	};

	const deleteSelected = useCallback(
		() => requestDelete([...selectedIds]),
		[requestDelete, selectedIds],
	);

	useDeleteShortcut(selectedIds.size > 0 && deleting === null, deleteSelected);

	const stopSelecting = useCallback(() => {
		setSelecting(false);
		setBulkTags(false);
		clear();
	}, [clear]);

	useEscape(selecting && !deleting, stopSelecting);

	// Ctrl or Shift enters selection mode, like the Select button.
	// In select mode a plain click adds or removes, like Ctrl+click outside it.
	const onSelect = (id: string, modifiers: SelectModifiers) => {
		if ((modifiers.toggle || modifiers.range) && !selecting) {
			setSelecting(true);
		}
		select(
			id,
			{ ...modifiers, toggle: modifiers.toggle || selecting },
			filteredItems.map((item) => item.id),
		);
	};

	const deletingName = (request: DeleteRequest) =>
		shortFileName(
			items.find((item) => item.id === request.ids[0])?.original_file_name ??
				'',
		);

	return (
		<div className="storage-screen">
			<div className="storage-header">
				<h1>{t.storage.title}</h1>
				<div className="storage-header-actions">
					{selecting ? (
						<>
							<span className="storage-selected-count">
								{t.storage.select.count(selectedIds.size)}
							</span>
							<button
								type="button"
								className="kg-btn kg-btn--secondary"
								onClick={() => selectAll(filteredItems.map((item) => item.id))}
							>
								{t.storage.select.all}
							</button>
							<div className="storage-bulk-tags">
								<button
									type="button"
									className="kg-btn kg-btn--secondary"
									disabled={selectedIds.size === 0}
									onClick={() => setBulkTags((open) => !open)}
								>
									{t.storage.select.tags(selectedIds.size)}
								</button>
								{bulkTags && (
									<BulkTagPopover
										items={selectedItems}
										onApply={(add, remove) =>
											updateTagsMany([...selectedIds], add, remove)
										}
										onClose={() => setBulkTags(false)}
									/>
								)}
							</div>
							<button
								type="button"
								className="kg-btn kg-btn--danger icon-hover"
								disabled={selectedIds.size === 0}
								onClick={deleteSelected}
							>
								<SketchIcon name="trash" />
								{t.storage.select.delete(selectedIds.size)}
							</button>
							<button
								type="button"
								className="kg-btn kg-btn--primary"
								onClick={stopSelecting}
							>
								{t.storage.select.done}
							</button>
						</>
					) : (
						<>
							<button
								type="button"
								className="kg-btn kg-btn--secondary"
								disabled={items.length === 0}
								onClick={() => setSelecting(true)}
							>
								{t.storage.select.start}
							</button>
							<button
								type="button"
								className="kg-btn kg-btn--primary"
								onClick={startImport}
							>
								{t.storage.import}
							</button>
						</>
					)}
				</div>
			</div>

			<section
				className={`library-island kg-drop-zone${dropping ? ' is-dropping' : ''}`}
				data-drop-hint={t.storage.dropHint}
			>
				{showMascot && items.length > 0 && <LibraryMascot flashes={imports} />}
				{importNotices.length > 0 && (
					<p className="storage-notice" role="status">
						{importNotices.join(' ')}
						<button
							type="button"
							className="kg-btn kg-btn--ghost kg-btn--sm"
							aria-label={t.common.dismiss}
							onClick={dismissImportNotices}
						>
							{t.common.dismiss}
						</button>
					</p>
				)}
				<MediaFilterBar
					filters={filters}
					onChange={setFilters}
					onOpenTags={openTags}
				/>

				{loading ? (
					<p className="empty-state">{t.common.loading}</p>
				) : items.length === 0 ? (
					<div className="storage-empty">
						{showMascot && <EmptyLibraryMascot />}
						<WaveText as="p" className="storage-empty-title">
							{t.storage.emptyLibrary}
						</WaveText>
						<p className="storage-empty-hint">{t.storage.emptyHint}</p>
					</div>
				) : (
					filteredItems.length === 0 && (
						<div className="storage-empty">
							<WaveText as="p" className="storage-empty-title">
								{t.storage.empty}
							</WaveText>
							<p className="storage-empty-hint">
								{t.storage.emptyFilteredHint}
							</p>
						</div>
					)
				)}

				{/* Stays mounted while empty, so the first import and an emptied filter still animate. */}
				{!loading && (
					<MediaGrid
						items={filteredItems}
						selectedIds={selectedIds}
						selecting={selecting}
						onSelect={onSelect}
						onUpdateTags={updateTags}
						onRename={renameMedia}
						onDelete={(item: MediaItem) => requestDelete([item.id])}
						filterKey={filterKey}
					/>
				)}
			</section>

			{managingTags && (
				<TagManager
					activeFilters={filters.tags}
					onToggleFilter={toggleTag}
					onClose={closeTags}
				/>
			)}

			{dialogs}

			{deleting && (
				<Modal
					title={t.storage.deleteConfirm.title(
						deletingName(deleting),
						deleting.ids.length,
					)}
					confirmLabel={t.storage.deleteConfirm.confirm(deleting.ids.length)}
					cancelLabel={t.storage.deleteConfirm.keep}
					destructive
					onCancel={() => setDeleting(null)}
					onConfirm={() => confirmDelete(deleting)}
				>
					<p className="modal-body">
						{t.storage.deleteConfirm.body(deleting.ids.length)}
					</p>
					{deleting.placed > 0 && (
						<p className="modal-body modal-warning">
							{t.storage.deleteConfirm.placed(deleting.ids.length)}
						</p>
					)}
				</Modal>
			)}
		</div>
	);
}

export default StorageScreen;
