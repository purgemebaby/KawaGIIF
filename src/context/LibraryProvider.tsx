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
	refresh: () => Promise<void>;
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
			const { rejected } = await invoke<ImportResult>('import_media', {
				paths,
				replaceExisting,
			});
			setRejected(rejected);
			await refresh();
		},
		[refresh],
	);

	const dismissRejected = useCallback(() => setRejected([]), []);

	const importFiles = useCallback(async (): Promise<PendingImport | null> => {
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
	}, [confirmImport]);

	const renameMedia = useCallback(async (id: string, name: string) => {
		await invoke('rename_media', { id, name });
	}, []);

	const updateTags = useCallback(async (id: string, next: string[]) => {
		await invoke('update_media_tags', { id, tags: next });
	}, []);

	const updateTagsMany = useCallback(
		async (ids: string[], add: string[], remove: string[]) => {
			await invoke('update_tags_many', { ids, add, remove });
		},
		[],
	);

	const renameTag = useCallback(async (from: string, to: string) => {
		await invoke('rename_tag', { from, to });
	}, []);

	const deleteTag = useCallback(async (name: string) => {
		await invoke('delete_tag', { name });
	}, []);

	const deleteMedia = useCallback(async (ids: string[], force = false) => {
		await invoke('delete_media', { ids, force });
	}, []);

	return (
		<LibraryContext.Provider
			value={{
				items,
				tags,
				loading,
				rejected,
				refresh,
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
