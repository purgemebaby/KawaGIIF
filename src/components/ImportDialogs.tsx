import { useState } from 'react';
import {
	fileNameOf,
	formatBytes,
	hasMediaExtension,
	shortFileName,
} from '../lib/media';
import { useLibrary, type PendingImport } from '../context/LibraryProvider';
import { useFileDrop } from '../hooks/useFileDrop';
import { notifyError } from '../lib/notify';
import { t } from '../i18n';
import Modal from './ui/Modal';

// One import flow for the Library and the editor's Storage panel:
// startImport() opens the picker, files dropped on the window import too (`dropping` while they hover),
// and `dialogs` asks about re-imports and large files.
// The Library shows refused files in its banner; elsewhere `toastNotices` shows them in the error toast.
export function useImportFlow({ toastNotices = false } = {}) {
	const { importFiles, prepareImport, confirmImport } = useLibrary();
	const [pendingImport, setPendingImport] = useState<PendingImport | null>(
		null,
	);

	const startImport = async () => setPendingImport(await importFiles());

	// Dropped files take the same road as picked ones. Other file types are named in the toast and left out.
	const dropping = useFileDrop(async (paths) => {
		const media = paths.filter(hasMediaExtension);
		const skipped = paths.filter((path) => !hasMediaExtension(path));
		if (skipped.length > 0) {
			notifyError(t.storage.dropSkipped(skipped.map(fileNameOf)));
		}
		if (media.length > 0) setPendingImport(await prepareImport(media));
	});

	const runImport = async (paths: string[], replace: boolean) => {
		const notices = await confirmImport(paths, replace);
		if (toastNotices) notices.forEach(notifyError);
	};

	// Skipping drops the files already in the library. Large files still ask next.
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
		if (paths.length > 0) await runImport(paths, replace);
	};

	// Asked first: files already in the library.
	const replaceDialog =
		pendingImport && pendingImport.reimports.length > 0 ? (
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
		) : null;

	// Asked second: files past the large-file threshold.
	const largeDialog =
		pendingImport && pendingImport.reimports.length === 0 ? (
			<Modal
				title={t.storage.largeImport.title}
				confirmLabel={t.storage.largeImport.confirm}
				onCancel={() => setPendingImport(null)}
				onConfirm={async () => {
					const { paths, replaceExisting } = pendingImport;
					setPendingImport(null);
					await runImport(paths, replaceExisting);
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
		) : null;

	return { startImport, dropping, dialogs: replaceDialog ?? largeDialog };
}
