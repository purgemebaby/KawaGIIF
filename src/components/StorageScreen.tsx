import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '../lib/ipc';
import { loadConfig } from '../lib/config';
import {
	fileNameOf,
	formatBytes,
	shortFileName,
	type MediaItem,
} from '../lib/media';
import { useLibrary, type PendingImport } from '../context/LibraryProvider';
import { useDeleteShortcut } from '../hooks/useDeleteShortcut';
import {
	useMediaSelection,
	type SelectModifiers,
} from '../hooks/useMediaSelection';
import { useImportCount } from '../hooks/useImportCount';
import { useMascotShown } from '../hooks/useMascotShown';
import { t } from '../i18n';
import { filterMedia, toggleTagFilter } from '../lib/mediaFilter';
import MediaFilterBar, {
	DEFAULT_FILTERS,
	type MediaFilters,
} from './MediaFilterBar';
import EmptyLibraryMascot from './mascot/EmptyLibraryMascot';
import LibraryMascot from './mascot/LibraryMascot';
import MediaGrid from './MediaGrid';
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
		rejected,
		importFiles,
		confirmImport,
		dismissRejected,
		renameMedia,
		updateTags,
		updateTagsMany,
		deleteMedia,
	} = useLibrary();
	const showMascot = useMascotShown();
	const imports = useImportCount(items, loading);
	const [filters, setFilters] = useState<MediaFilters>(DEFAULT_FILTERS);
	const [managingTags, setManagingTags] = useState(false);
	const [deleting, setDeleting] = useState<DeleteRequest | null>(null);
	const [confirmBeforeDelete, setConfirmBeforeDelete] = useState(true);
	const [pendingImport, setPendingImport] = useState<PendingImport | null>(
		null,
	);
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

	const filteredItems = useMemo(
		() => filterMedia(items, filters),
		[items, filters],
	);
	const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

	// Files on the desktop always ask first, even with confirmation turned off in Settings.
	const requestDelete = useCallback(
		async (ids: string[]) => {
			if (ids.length === 0) return;
			const placed = await invoke<number>('count_placed_media', { ids });
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

	useEffect(() => {
		if (!selecting || deleting) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') stopSelecting();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [selecting, deleting, stopSelecting]);

	// In select mode a plain click adds or removes, like Ctrl+click outside it.
	const onSelect = (id: string, modifiers: SelectModifiers) =>
		select(
			id,
			{ ...modifiers, toggle: modifiers.toggle || selecting },
			filteredItems.map((item) => item.id),
		);

	// Skipping drops the files already in the library; large files still ask next.
	const answerReplace = async (request: PendingImport, replace: boolean) => {
		const paths = replace
			? request.paths
			: request.paths.filter((path) => !request.reimports.includes(path));
		const large = request.large.filter((f) => paths.includes(f.path));
		const next = { paths, large, reimports: [], replaceExisting: replace };
		if (large.length > 0) {
			setPendingImport(next);
			return;
		}
		setPendingImport(null);
		if (paths.length > 0) await confirmImport(paths, replace);
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
								className="kg-btn kg-btn--danger pixel-hover"
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
								onClick={async () => setPendingImport(await importFiles())}
							>
								{t.storage.import}
							</button>
						</>
					)}
				</div>
			</div>

			<section className="library-island">
				{showMascot && items.length > 0 && <LibraryMascot flashes={imports} />}
				{rejected.length > 0 && (
					<p className="storage-notice" role="status">
						{t.storage.rejected(rejected)}
						<button
							type="button"
							className="kg-btn kg-btn--ghost kg-btn--sm"
							aria-label={t.common.dismiss}
							onClick={dismissRejected}
						>
							{t.common.dismiss}
						</button>
					</p>
				)}
				<MediaFilterBar
					filters={filters}
					onChange={setFilters}
					onOpenTags={() => setManagingTags(true)}
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
					onToggleFilter={(tag) =>
						setFilters((prev) => toggleTagFilter(prev, tag))
					}
					onClose={() => setManagingTags(false)}
				/>
			)}

			{pendingImport && pendingImport.reimports.length > 0 && (
				<Modal
					title={t.storage.replaceImport.title}
					confirmLabel={t.storage.replaceImport.confirm}
					cancelLabel={t.storage.replaceImport.skip}
					onCancel={() => answerReplace(pendingImport, false)}
					onConfirm={() => answerReplace(pendingImport, true)}
				>
					<p className="modal-body">
						{pendingImport.reimports
							.map((path) => shortFileName(fileNameOf(path)))
							.join(', ')}
					</p>
					<p className="modal-body">{t.storage.replaceImport.body}</p>
				</Modal>
			)}

			{pendingImport && pendingImport.reimports.length === 0 && (
				<Modal
					title={t.storage.largeImport.title}
					confirmLabel={t.storage.largeImport.confirm}
					onCancel={() => setPendingImport(null)}
					onConfirm={async () => {
						const { paths, replaceExisting } = pendingImport;
						setPendingImport(null);
						await confirmImport(paths, replaceExisting);
					}}
				>
					<p className="modal-body">
						{t.storage.largeImport.body(
							pendingImport.large
								.map((f) =>
									t.storage.largeImport.fileEntry(
										fileNameOf(f.path),
										formatBytes(f.bytes),
									),
								)
								.join(', '),
							formatBytes(
								pendingImport.large.reduce((sum, f) => sum + f.bytes, 0),
							),
						)}
					</p>
				</Modal>
			)}

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
