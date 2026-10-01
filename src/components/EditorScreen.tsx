import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../lib/ipc";
import type { Template } from "../lib/placed";
import MediaSidebar from "./MediaSidebar";
import PlacedItemsList from "./PlacedItemsList";
import PropertiesPanel from "./PropertiesPanel";
import Modal from "./ui/Modal";
import { useEditorSync } from "../hooks/useEditorSync";
import { useDeleteShortcut } from "../hooks/useDeleteShortcut";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { t } from "../i18n/en";
import "./EditorScreen.css";

function EditorScreen() {
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [changeSummary, setChangeSummary] = useState({ added: 0, moved: 0, removed: 0 });
  const savedIdsRef = useRef<Set<string>>(new Set());
  const { movedInstanceIds, resetMoved, selectedId } = useEditorSync();

  const deleteSelected = useCallback(() => {
    if (selectedId) invoke("remove_placed_media", { instanceId: selectedId });
  }, [selectedId]);

  useDeleteShortcut(selectedId !== null, deleteSelected);

  useEffect(() => {
    (async () => {
      const tpl = await invoke<Template>("load_template");
      savedIdsRef.current = new Set(tpl.items.map((i) => i.instance_id));
      await invoke("set_edit_mode", { enabled: true });
    })();
    return () => {
      invoke("set_edit_mode", { enabled: false });
      invoke("set_control_minimizable", { enabled: true });
    };
  }, []);

  const syncMinimizable = useCallback(async () => {
    const dirty = await invoke<boolean>("has_unsaved_changes");
    await invoke("set_control_minimizable", { enabled: !dirty });
  }, []);

  useEffect(() => {
    syncMinimizable();
  }, [syncMinimizable, movedInstanceIds]);

  useTauriEvent("placed-items-changed", syncMinimizable);

  const openSaveConfirm = async () => {
    const working = await invoke<Template>("get_working_template");
    const currentIds = new Set(working.items.map((i) => i.instance_id));
    const added = working.items.filter((i) => !savedIdsRef.current.has(i.instance_id)).length;
    const removed = [...savedIdsRef.current].filter((id) => !currentIds.has(id)).length;
    const moved = [...movedInstanceIds].filter(
      (id) => currentIds.has(id) && savedIdsRef.current.has(id),
    ).length;
    setChangeSummary({ added, moved, removed });
    setShowSaveConfirm(true);
  };

  const confirmSave = async () => {
    await invoke("save_template");
    const working = await invoke<Template>("get_working_template");
    savedIdsRef.current = new Set(working.items.map((i) => i.instance_id));
    resetMoved();
    setShowSaveConfirm(false);
    await syncMinimizable();
  };

  const confirmUndo = async () => {
    await invoke("discard_template_changes");
    const saved = await invoke<Template>("get_working_template");
    savedIdsRef.current = new Set(saved.items.map((i) => i.instance_id));
    resetMoved();
    setShowUndoConfirm(false);
    await syncMinimizable();
  };

  const hasChanges =
    changeSummary.added > 0 || changeSummary.moved > 0 || changeSummary.removed > 0;

  return (
    <div className="editor-screen">
      <div className="editor-toolbar">
        <h1>{t.editor.title}</h1>
        <div className="editor-toolbar-actions">
          <button
            type="button"
            className="kg-btn kg-btn--secondary"
            onClick={() => setShowUndoConfirm(true)}
          >
            {t.editor.undo}
          </button>
          <button type="button" className="kg-btn kg-btn--primary" onClick={openSaveConfirm}>
            {t.editor.save}
          </button>
        </div>
      </div>

      <div className="editor-body">
        <MediaSidebar />
        <div className="editor-canvas-hint">
          {t.editor.canvasHint.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <PlacedItemsList />
        </div>
        <PropertiesPanel selectedId={selectedId} />
      </div>

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
