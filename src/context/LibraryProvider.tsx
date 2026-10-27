import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '../lib/ipc';
import { notifyError } from '../lib/notify';
import { t } from '../i18n';
import { MEDIA_EXTENSIONS, type MediaItem, type TagCount } from '../lib/media';
import { useTauriEvent } from '../hooks/useTauriEvent';

export interface PendingImport {
	paths: string[];
	large: { path: string; bytes: number }[];
	/** Paths already in the library: asked about first, then emptied. */
	reimports: string[];
	/** Answer to the re-import question, sent along with the import. */
	replaceExisting: boolean;
}

interface LibraryContextValue {
	items: MediaItem[];
	tags: TagCount[];
	loading: boolean;
	/** Ready-made messages about the files the last import refused. */
	importNotices: string[];
	importFiles: () => Promise<PendingImport | null>;
	/** Imports `paths` (from a drop) right away, or returns what must be asked first. */
	prepareImport: (paths: string[]) => Promise<PendingImport | null>;
	/** Imports `paths` and returns the notices about refused files (also kept in `importNotices`). */
	confirmImport: (
		paths: string[],
		replaceExisting: boolean,
	) => Promise<string[]>;
	dismissImportNotices: () => void;
	renameMedia: (id: string, name: string) => Promise<void>;
	updateTags: (id: string, tags: string[]) => Promise<void>;
	updateTagsMany: (
		ids: string[],
		add: string[],
		remove: string[],
	) => Promise<void>;
	renameTag: (from: string, to: string) => Promise<void>;
	deleteTag: (name: string) => Promise<void>;
	deleteMedia: (ids: string[], force?: boolean) => Promise<void>;
}

interface ImportResult {
	items: MediaItem[];
	rejected: string[];
	too_large: string[];
}

const LARGE_FILE_BYTES = 150 * 1024 * 1024;

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<MediaItem[]>([]);
	const [tags, setTags] = useState<TagCount[]>([]);
	const [loading, setLoading] = useState(true);
	const [importNotices, setImportNotices] = useState<string[]>([]);

	// `loading` only covers the first fetch: a refresh keeps the grid mounted so its cards can animate.
	const refresh = useCallback(async () => {
		try {
			const [media, tagCounts] = await Promise.all([
				invoke<MediaItem[]>('list_media'),
				invoke<TagCount[]>('list_all_tags'),
			]);
			setItems(media);
			setTags(tagCounts);
		} catch (e) {
			notifyError(e);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useTauriEvent('library-changed', refresh);

	const confirmImport = useCallback(
		async (paths: string[], replaceExisting: boolean) => {
			setImportNotices([]);
			try {
				const result = await invoke<ImportResult>('import_media', {
					paths,
					replaceExisting,
				});
				// ready-made messages: the Library shows them in its banner, the Editor as a toast
				const notices = [
					result.rejected.length > 0 ? t.storage.rejected(result.rejected) : '',
					result.too_large.length > 0
						? t.storage.tooLarge(result.too_large)
						: '',
				].filter(Boolean);
				setImportNotices(notices);
				await refresh();
				return notices;
			} catch (e) {
				notifyError(e);
				return [];
			}
		},
		[refresh],
	);

	const dismissImportNotices = useCallback(() => setImportNotices([]), []);

	const prepareImport = useCallback(
		async (paths: string[]): Promise<PendingImport | null> => {
			try {
				const [reimports, sizes] = await Promise.all([
					invoke<string[]>('find_reimports', { paths }),
					invoke<number[]>('get_file_sizes', { paths }),
				]);
				const large = paths
					.map((path, i) => ({ path, bytes: sizes[i] ?? 0 }))
					.filter((f) => f.bytes >= LARGE_FILE_BYTES);

				if (large.length === 0 && reimports.length === 0) {
					await confirmImport(paths, false);
					return null;
				}
				return { paths, large, reimports, replaceExisting: false };
			} catch (e) {
				notifyError(e);
				return null;
			}
		},
		[confirmImport],
	);

	const importFiles = useCallback(async (): Promise<PendingImport | null> => {
		try {
			const selected = await open({
				multiple: true,
				filters: [{ name: 'Media', extensions: MEDIA_EXTENSIONS }],
			});
			if (!selected) return null;
			return await prepareImport(
				Array.isArray(selected) ? selected : [selected],
			);
		} catch (e) {
			notifyError(e);
			return null;
		}
	}, [prepareImport]);

	// Runs a library command, showing the error toast instead of rejecting to the caller.
	const invokeGuarded = useCallback(
		async (command: string, args?: Record<string, unknown>) => {
			try {
				await invoke(command, args);
			} catch (e) {
				notifyError(e);
			}
		},
		[],
	);

	const renameMedia = useCallback(
		(id: string, name: string) => invokeGuarded('rename_media', { id, name }),
		[invokeGuarded],
	);

	const updateTags = useCallback(
		(id: string, next: string[]) =>
			invokeGuarded('update_media_tags', { id, tags: next }),
		[invokeGuarded],
	);

	const updateTagsMany = useCallback(
		(ids: string[], add: string[], remove: string[]) =>
			invokeGuarded('update_tags_many', { ids, add, remove }),
		[invokeGuarded],
	);

	const renameTag = useCallback(
		(from: string, to: string) => invokeGuarded('rename_tag', { from, to }),
		[invokeGuarded],
	);

	const deleteTag = useCallback(
		(name: string) => invokeGuarded('delete_tag', { name }),
		[invokeGuarded],
	);

	const deleteMedia = useCallback(
		(ids: string[], force = false) =>
			invokeGuarded('delete_media', { ids, force }),
		[invokeGuarded],
	);

	return (
		<LibraryContext.Provider
			value={{
				items,
				tags,
				loading,
				importNotices,
				importFiles,
				prepareImport,
				confirmImport,
				dismissImportNotices,
				renameMedia,
				updateTags,
				updateTagsMany,
				renameTag,
				deleteTag,
				deleteMedia,
			}}
		>
			{children}
		</LibraryContext.Provider>
	);
}

export function useLibrary(): LibraryContextValue {
	const ctx = useContext(LibraryContext);
	if (!ctx) {
		throw new Error('useLibrary must be used inside a <LibraryProvider>');
	}
	return ctx;
}
