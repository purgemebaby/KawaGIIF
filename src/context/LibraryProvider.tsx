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
import type { MediaItem, TagCount } from '../lib/media';
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
	/** File names whose content did not match their extension during the last import. */
	rejected: string[];
	importFiles: () => Promise<PendingImport | null>;
	confirmImport: (paths: string[], replaceExisting: boolean) => Promise<void>;
	dismissRejected: () => void;
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
}

const LARGE_FILE_BYTES = 150 * 1024 * 1024;

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<MediaItem[]>([]);
	const [tags, setTags] = useState<TagCount[]>([]);
	const [loading, setLoading] = useState(true);
	const [rejected, setRejected] = useState<string[]>([]);

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
			setRejected([]);
			try {
				const { rejected } = await invoke<ImportResult>('import_media', {
					paths,
					replaceExisting,
				});
				setRejected(rejected);
				await refresh();
			} catch (e) {
				notifyError(e);
			}
		},
		[refresh],
	);

	const dismissRejected = useCallback(() => setRejected([]), []);

	const importFiles = useCallback(async (): Promise<PendingImport | null> => {
		try {
			const selected = await open({
				multiple: true,
				filters: [
					{
						name: 'Media',
						extensions: ['gif', 'mp4', 'jpg', 'jpeg', 'png', 'webp', 'svg'],
					},
				],
			});
			if (!selected) return null;
			const paths = Array.isArray(selected) ? selected : [selected];

			const reimports = await invoke<string[]>('find_reimports', { paths });
			const sizes = await Promise.all(
				paths.map(async (path) => {
					try {
						return {
							path,
							bytes: await invoke<number>('get_file_size', { path }),
						};
					} catch {
						return { path, bytes: 0 };
					}
				}),
			);
			const large = sizes.filter((f) => f.bytes >= LARGE_FILE_BYTES);

			if (large.length === 0 && reimports.length === 0) {
				await confirmImport(paths, false);
				return null;
			}
			return { paths, large, reimports, replaceExisting: false };
		} catch (e) {
			notifyError(e);
			return null;
		}
	}, [confirmImport]);

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
				rejected,
				importFiles,
				confirmImport,
				dismissRejected,
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
