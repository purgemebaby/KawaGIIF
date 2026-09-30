import React from "react";
import ReactDOM from "react-dom/client";
import ControlApp from "./windows/ControlApp";
import { suppressBrowserContextMenu } from "./entries/shared";
// Hoja completa: tokens, reset, animaciones y componentes. Solo esta ventana
// la necesita — las de animación cargan `styles/overlay.css`, que es mínima.
import "./styles/index.css";

/**
 * Entrada de la ventana de control (Inicio, Biblioteca, Editor, Ajustes).
 *
 * Antes este archivo servía a las TRES clases de ventana y decidía en tiempo
 * de ejecución cuál montar, lo que obligaba a importar las tres de forma
 * estática y metía el bundle entero en cada una. Ahora cada ventana tiene su
 * propia entrada y su propio HTML; ver `entries/overlay.tsx`.
 */
suppressBrowserContextMenu();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ControlApp />
  </React.StrictMode>,
);
