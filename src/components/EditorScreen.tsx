import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from 'react';
import { invoke } from '../lib/ipc';
import type { Template } from '../lib/placed';
import { useEditorSync } from '../hooks/useEditorSync';
import { useDeleteShortcut } from '../hooks/useDeleteShortcut';
import { booleanCodec, usePersistentState } from '../hooks/usePersistentState';
import { useStorageResize } from '../hooks/useStorageResize';
import { t } from '../i18n/en';
import EditorPanelHeader from './EditorPanelHeader';
import MediaSidebar from './MediaSidebar';
import PlacedItemsList from './PlacedItemsList';
import PropertiesPanel from './PropertiesPanel';
import Modal from './ui/Modal';
import './EditorScreen.css';

function instanceIdsOf(template: Template): Set<string> {
	return new Set(template.items.map((i) => i.instance_id));
}

/** The body stays mounted inside the wrapper that slides it shut, so collapsing animates. */
function PanelCollapse({
	collapsed,
	children,
}: {
	collapsed: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className="editor-panel-collapse"
			inert={collapsed}
			aria-hidden={collapsed}
		>
			<div className="editor-panel-body">{children}</div>
		</div>
	);
}

function EditorScreen() {
	const [showSaveConfirm, setShowSaveConfirm] = useState(false);
	const [showUndoConfirm, setShowUndoConfirm] = useState(false);
	const [changeSummary, setChangeSummary] = useState({
		added: 0,
		moved: 0,
		removed: 0,
	});
	const savedIdsRef = useRef<Set<string>>(new Set());
	const { movedInstanceIds, resetMoved, selectedId } = useEditorSync();
	const [storageCollapsed, setStorageCollapsed] = usePersistentState(
		'kawagiif.editor.storage.collapsed',
		false,
		booleanCodec,
	);
	const { storageHeight, resetStorageHeight, storageSectionRef, startResize } =
		useStorageResize();
	const [controlCollapsed, setControlCollapsed] = usePersistentState(
		'kawagiif.editor.control.collapsed',
		false,
		booleanCodec,
	);
	const [editCollapsed, setEditCollapsed] = usePersistentState(
		'kawagiif.editor.edit.collapsed',
		false,
		booleanCodec,
	);

	const deleteSelected = useCallback(() => {
		if (selectedId) invoke('remove_placed_media', { instanceId: selectedId });
	}, [selectedId]);

	useDeleteShortcut(selectedId !== null, deleteSelected);

	// Selecting opens the drawer once; collapsing it afterwards sticks until another selection.
	useEffect(() => {
		if (selectedId) setControlCollapsed(false);
	}, [selectedId, setControlCollapsed]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const tpl = await invoke<Template>('load_template');
			if (cancelled) return;
			savedIdsRef.current = instanceIdsOf(tpl);
			await invoke('set_edit_mode', { enabled: true });
		})();
		return () => {
			cancelled = true;
			invoke('set_edit_mode', { enabled: false });
		};
	}, []);

	const openSaveConfirm = async () => {
		const working = await invoke<Template>('get_working_template');
		const currentIds = instanceIdsOf(working);
		const added = working.items.filter(
			(i) => !savedIdsRef.current.has(i.instance_id),
		).length;
		const removed = [...savedIdsRef.current].filter(
			(id) => !currentIds.has(id),
		).length;
		const moved = [...movedInstanceIds].filter(
			(id) => currentIds.has(id) && savedIdsRef.current.has(id),
		).length;
		setChangeSummary({ added, moved, removed });
		setShowSaveConfirm(true);
	};

	const confirmSave = async () => {
		await invoke('save_template');
		const working = await invoke<Template>('get_working_template');
		savedIdsRef.current = instanceIdsOf(working);
		resetMoved();
		setShowSaveConfirm(false);
	};

	const confirmUndo = async () => {
		await invoke('discard_template_changes');
		const saved = await invoke<Template>('get_working_template');
		savedIdsRef.current = instanceIdsOf(saved);
		resetMoved();
		setShowUndoConfirm(false);
	};

	const hasChanges =
		changeSummary.added > 0 ||
		changeSummary.moved > 0 ||
		changeSummary.removed > 0;

	return (
		<div
			className="editor-screen"
			data-storage-collapsed={storageCollapsed}
			data-control-collapsed={controlCollapsed}
			data-edit-collapsed={editCollapsed}
		>
			<section
				ref={storageSectionRef}
				className={
					storageHeight > 0
						? 'editor-panel editor-panel--storage is-sized'
						: 'editor-panel editor-panel--storage'
				}
				data-burst="storage"
				data-collapsed={storageCollapsed}
				style={
					storageHeight > 0
						? ({ '--storage-body-h': `${storageHeight}px` } as CSSProperties)
						: undefined
				}
			>
				<EditorPanelHeader
					title={t.editor.panels.storage}
					collapsed={storageCollapsed}
					onToggle={() => setStorageCollapsed(!storageCollapsed)}
				/>
				<PanelCollapse collapsed={storageCollapsed}>
					<MediaSidebar wrap={storageHeight > 0} />
				</PanelCollapse>
				{!storageCollapsed && (
					<div
						className="editor-storage-resize"
						role="separator"
						aria-orientation="horizontal"
						aria-label={t.editor.panels.resizeStorage}
						onPointerDown={startResize}
						onDoubleClick={resetStorageHeight}
					/>
				)}
			</section>

			<section
				className="editor-panel editor-panel--control"
				data-burst="settings"
				data-collapsed={controlCollapsed}
			>
				<EditorPanelHeader
					title={t.editor.panels.control}
					collapsed={controlCollapsed}
					onToggle={() => setControlCollapsed(!controlCollapsed)}
				/>
				<PanelCollapse collapsed={controlCollapsed}>
					<PropertiesPanel selectedId={selectedId} />
				</PanelCollapse>
			</section>

			<div className="editor-canvas-hint">
				{t.editor.canvasHint.map((line) => (
					<p key={line}>{line}</p>
				))}
			</div>

			<section
				className="editor-panel editor-panel--edit"
				data-burst="editor"
				data-collapsed={editCollapsed}
			>
				<EditorPanelHeader
					title={t.editor.panels.edit}
					collapsed={editCollapsed}
					onToggle={() => setEditCollapsed(!editCollapsed)}
				/>
				<PanelCollapse collapsed={editCollapsed}>
					<div className="editor-actions">
						<button
							type="button"
							className="kg-btn kg-btn--secondary"
							onClick={() => setShowUndoConfirm(true)}
						>
							{t.editor.undo}
						</button>
						<button
							type="button"
							className="kg-btn kg-btn--primary"
							onClick={openSaveConfirm}
						>
							{t.editor.save}
						</button>
					</div>
					<PlacedItemsList />
				</PanelCollapse>
			</section>

			{showSaveConfirm && (
				<Modal
					title={t.editor.saveConfirm.title}
					confirmLabel={t.common.apply}
					onCancel={() => setShowSaveConfirm(false)}
					onConfirm={confirmSave}
				>
					{hasChanges ? (
						<ul className="modal-summary">
							<li>{t.editor.saveConfirm.added(changeSummary.added)}</li>
							<li>{t.editor.saveConfirm.moved(changeSummary.moved)}</li>
							<li>{t.editor.saveConfirm.removed(changeSummary.removed)}</li>
						</ul>
					) : (
						<p className="modal-body">{t.editor.saveConfirm.noChanges}</p>
					)}
				</Modal>
			)}

			{showUndoConfirm && (
				<Modal
					title={t.editor.undoConfirm.title}
					confirmLabel={t.editor.undoConfirm.confirm}
					destructive
					onCancel={() => setShowUndoConfirm(false)}
					onConfirm={confirmUndo}
				>
					<p className="modal-body">{t.editor.undoConfirm.body}</p>
				</Modal>
			)}
		</div>
	);
}

export default EditorScreen;
