import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/ipc';
import type { Template } from '../lib/placed';
import { useEditorSync } from '../hooks/useEditorSync';
import { useDeleteShortcut } from '../hooks/useDeleteShortcut';
import { useMonitors } from '../hooks/useMonitors';
import { usePersistentToggle } from '../hooks/usePersistentToggle';
import { primaryMonitorIndex } from '../lib/monitors';
import { t } from '../i18n/en';
import MediaSidebar from './MediaSidebar';
import PlacedItemsList from './PlacedItemsList';
import PropertiesPanel from './PropertiesPanel';
import Modal from './ui/Modal';
import MonitorSelect from './ui/MonitorSelect';
import './EditorScreen.css';

function instanceIdsOf(template: Template): Set<string> {
	return new Set(template.items.map((i) => i.instance_id));
}

interface PanelHeaderProps {
	title: string;
	collapsed: boolean;
	onToggle: () => void;
}

// The chevron is drawn pointing down; CSS turns it towards the panel's edge.
function PanelHeader({ title, collapsed, onToggle }: PanelHeaderProps) {
	return (
		<header className="editor-panel-header">
			<h2>{title}</h2>
			<button
				type="button"
				className="kg-btn kg-btn--icon editor-panel-toggle"
				aria-expanded={!collapsed}
				aria-label={
					collapsed
						? t.editor.panels.expand(title)
						: t.editor.panels.collapse(title)
				}
				onClick={onToggle}
			>
				<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
					<path
						d="M2 4l4 4 4-4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
		</header>
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
	const monitors = useMonitors();
	const [chosenMonitor, setChosenMonitor] = useState<number | null>(null);
	const targetMonitor = chosenMonitor ?? primaryMonitorIndex(monitors);
	const [storageCollapsed, setStorageCollapsed] = usePersistentToggle(
		'kawagiif.editor.storage.collapsed',
		false,
	);
	const [controlCollapsed, setControlCollapsed] = usePersistentToggle(
		'kawagiif.editor.control.collapsed',
		false,
	);
	const [editCollapsed, setEditCollapsed] = usePersistentToggle(
		'kawagiif.editor.edit.collapsed',
		false,
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
		(async () => {
			const tpl = await invoke<Template>('load_template');
			savedIdsRef.current = instanceIdsOf(tpl);
			await invoke('set_edit_mode', { enabled: true });
		})();
		return () => {
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
				className="editor-panel editor-panel--storage"
				data-burst="storage"
				data-collapsed={storageCollapsed}
			>
				<PanelHeader
					title={t.editor.panels.storage}
					collapsed={storageCollapsed}
					onToggle={() => setStorageCollapsed(!storageCollapsed)}
				/>
				{!storageCollapsed && (
					<div className="editor-panel-body">
						<MediaSidebar targetMonitor={targetMonitor} />
					</div>
				)}
			</section>

			<section
				className="editor-panel editor-panel--control"
				data-burst="settings"
				data-collapsed={controlCollapsed}
			>
				<PanelHeader
					title={t.editor.panels.control}
					collapsed={controlCollapsed}
					onToggle={() => setControlCollapsed(!controlCollapsed)}
				/>
				{!controlCollapsed && (
					<div className="editor-panel-body">
						<MonitorSelect
							monitors={monitors}
							value={targetMonitor}
							label={t.editor.monitor.targetLabel}
							hint={t.editor.monitor.targetHint}
							onChange={setChosenMonitor}
						/>
						<PropertiesPanel selectedId={selectedId} />
					</div>
				)}
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
				<PanelHeader
					title={t.editor.panels.edit}
					collapsed={editCollapsed}
					onToggle={() => setEditCollapsed(!editCollapsed)}
				/>
				{!editCollapsed && (
					<div className="editor-panel-body">
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
					</div>
				)}
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
