import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, listen } from "../lib/ipc";
import NavSidebar from "../components/NavSidebar";
import { NAV_ITEMS, type Screen } from "../components/navItems";
import HomeScreen from "../components/HomeScreen";
import StorageScreen from "../components/StorageScreen";
import EditorScreen from "../components/EditorScreen";
import SettingsScreen from "../components/SettingsScreen";
import LoadingScreen from "../components/LoadingScreen";
import Modal from "../components/ui/Modal";
import { LibraryProvider } from "../context/LibraryProvider";
import { t } from "../i18n/es";
import "./ControlApp.css";

/** Qué hacer una vez resuelta la guarda de cambios sin guardar. */
type PendingExit = { kind: "navigate"; screen: Screen } | { kind: "hide" };

/**
 * A nivel de MÓDULO, no de estado: la ventana de control no se destruye nunca,
 * solo se oculta a la bandeja. Con un `useState` la pantalla de carga
 * volvería a salir cada vez que se reabre el panel desde la bandeja, y
 * esperar cinco segundos cada vez sería exasperante. Así se ve una vez por
 * ejecución de la app, que es lo que se pidió.
 */
let hasBooted = false;

const NAV_COLLAPSED_KEY = "kg.nav.collapsed";

function ControlApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  const [booting, setBooting] = useState(!hasBooted);
  // Cerrada por defecto, como el explorador de Obsidian. La preferencia se
  // guarda en localStorage: es puramente de interfaz y no merece un viaje a
  // Rust ni una entrada en config.toml.
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) !== "false",
  );

  // El guardado va FUERA del actualizador de estado. React puede invocar esa
  // función más de una vez (lo hace a propósito en desarrollo), así que
  // cualquier efecto secundario metido ahí dentro se ejecuta repetido.
  const toggleNav = useCallback(() => {
    const next = !navCollapsed;
    localStorage.setItem(NAV_COLLAPSED_KEY, String(next));
    setNavCollapsed(next);
  }, [navCollapsed]);

  /**
   * El trabajo real de arranque. Se crea una sola vez para que la promesa no
   * se recree en cada render y la barra no se reinicie.
   */
  const bootWork = useMemo(
    () => Promise.all([invoke("get_config"), invoke("list_media")]).catch(() => null),
    [],
  );

  /**
   * Dirección del deslizado al cambiar de pantalla: hacia una que está más
   * abajo en la barra lateral, el contenido entra desde abajo. Da sensación
   * de recorrer una lista en vez de que las pantallas se sustituyan sin más.
   */
  const [slideDirection, setSlideDirection] = useState("from-below");

  // La pantalla actual en una ref, para poder calcular la dirección sin meter
  // la lógica dentro del actualizador de `setScreen` (ver `toggleNav`) y sin
  // que `runExit` se recree en cada navegación.
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const runExit = useCallback((exit: PendingExit) => {
    if (exit.kind === "navigate") {
      // Navegar a la pantalla en la que ya estás no debe animar nada.
      if (exit.screen === screenRef.current) return;

      const from = NAV_ITEMS.findIndex((i) => i.id === screenRef.current);
      const to = NAV_ITEMS.findIndex((i) => i.id === exit.screen);
      setSlideDirection(to > from ? "from-below" : "from-above");
      setScreen(exit.screen);
    } else {
      invoke("hide_control_window");
    }
  }, []);

  /**
   * Toda salida del editor pasa por aquí. Si hay cambios sin guardar se abre
   * la guarda en vez de salir: antes, salir dejaba los elementos colocados en
   * el escritorio pero al volver a entrar desaparecían, porque lo que se veía,
   * lo que había en memoria y lo que había en disco eran tres cosas distintas.
   */
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

  // El backend intercepta el botón X y, si el editor está sucio, nos pasa la
  // pelota en vez de esconder la ventana sin preguntar.
  useEffect(() => {
    const unlisten = listen("close-requested", () => {
      requestExit({ kind: "hide" });
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [requestExit]);

  const resolveExit = async (action: "save" | "discard") => {
    if (!pendingExit) return;
    if (action === "save") {
      await invoke("save_template");
    } else {
      // Descartar deja el escritorio exactamente como la última plantilla
      // guardada, que es lo que se verá al volver a entrar al editor.
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

          {/* La `key` fuerza el remontaje al navegar, que es lo que hace que
              la animación de entrada se reproduzca cada vez y no solo la
              primera. */}
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
