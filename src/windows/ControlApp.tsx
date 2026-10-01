import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "../lib/ipc";
import { useTauriEvent } from "../hooks/useTauriEvent";
import NavSidebar from "../components/NavSidebar";
import { NAV_ITEMS, type Screen } from "../components/navItems";
import HomeScreen from "../components/HomeScreen";
import StorageScreen from "../components/StorageScreen";
import EditorScreen from "../components/EditorScreen";
import SettingsScreen from "../components/SettingsScreen";
import LoadingScreen from "../components/LoadingScreen";
import Modal from "../components/ui/Modal";
import { LibraryProvider } from "../context/LibraryProvider";
import { t } from "../i18n/en";
import "./ControlApp.css";

type PendingExit = { kind: "navigate"; screen: Screen } | { kind: "hide" };

let hasBooted = false;

const NAV_COLLAPSED_KEY = "kg.nav.collapsed";

function ControlApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  const [booting, setBooting] = useState(!hasBooted);
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) !== "false",
  );

  const toggleNav = useCallback(() => {
    const next = !navCollapsed;
    localStorage.setItem(NAV_COLLAPSED_KEY, String(next));
    setNavCollapsed(next);
  }, [navCollapsed]);

  const bootWork = useMemo(
    () => Promise.all([invoke("get_config"), invoke("list_media")]).catch(() => null),
    [],
  );

  const [slideDirection, setSlideDirection] = useState("from-below");

  const screenRef = useRef(screen);
  screenRef.current = screen;

  const runExit = useCallback((exit: PendingExit) => {
    if (exit.kind === "navigate") {
      if (exit.screen === screenRef.current) return;

      const from = NAV_ITEMS.findIndex((i) => i.id === screenRef.current);
      const to = NAV_ITEMS.findIndex((i) => i.id === exit.screen);
      setSlideDirection(to > from ? "from-below" : "from-above");
      setScreen(exit.screen);
    } else {
      invoke("hide_control_window");
    }
  }, []);

  const requestExit = useCallback(
    async (exit: PendingExit) => {
      if (screen !== "editor") {
        runExit(exit);
        return;
      }
      const dirty = await invoke<boolean>("has_unsaved_changes");
      if (dirty) {
        setPendingExit(exit);
      } else {
        runExit(exit);
      }
    },
    [screen, runExit],
  );

  useTauriEvent("close-requested", () => requestExit({ kind: "hide" }));

  const resolveExit = async (action: "save" | "discard") => {
    if (!pendingExit) return;
    if (action === "save") {
      await invoke("save_template");
    } else {
      await invoke("discard_template_changes");
    }
    await invoke("set_control_minimizable", { enabled: true });
    const exit = pendingExit;
    setPendingExit(null);
    runExit(exit);
  };

  return (
    <LibraryProvider>
      <div className="control-shell">
        {booting && (
          <LoadingScreen
            work={bootWork}
            onDone={() => {
              hasBooted = true;
              setBooting(false);
            }}
          />
        )}

        <NavSidebar
          active={screen}
          collapsed={navCollapsed}
          onNavigate={(next) => requestExit({ kind: "navigate", screen: next })}
        />
        <main className="control-content">
          <div className="content-topbar">
            <button
              type="button"
              className="kg-btn kg-btn--icon"
              onClick={toggleNav}
              aria-expanded={!navCollapsed}
              aria-label={navCollapsed ? t.nav.open : t.nav.close}
              title={navCollapsed ? t.nav.open : t.nav.close}
            >
              ☰
            </button>
          </div>

          <div key={screen} className={`screen-slot ${slideDirection}`}>
            {screen === "home" && (
              <HomeScreen
                onNavigate={(next) => requestExit({ kind: "navigate", screen: next })}
              />
            )}
            {screen === "storage" && <StorageScreen />}
            {screen === "editor" && <EditorScreen />}
            {screen === "settings" && <SettingsScreen />}
          </div>
        </main>

        {pendingExit && (
          <Modal
            title={t.editor.exitGuard.title}
            confirmLabel={t.common.save}
            onCancel={() => setPendingExit(null)}
            onConfirm={() => resolveExit("save")}
            extraActions={
              <button
                type="button"
                className="kg-btn kg-btn--danger"
                onClick={() => resolveExit("discard")}
              >
                {t.common.discard}
              </button>
            }
          >
            <p className="modal-body">{t.editor.exitGuard.body}</p>
          </Modal>
        )}
      </div>
    </LibraryProvider>
  );
}

export default ControlApp;
