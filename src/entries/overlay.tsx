import React from "react";
import ReactDOM from "react-dom/client";
import OverlayItemApp from "../windows/OverlayItemApp";
import { makeWindowTransparent, suppressBrowserContextMenu } from "./shared";
// Hoja mínima, NO `styles/index.css`: ver la nota de `styles/overlay.css`.
import "../styles/overlay.css";

/**
 * Entrada de las ventanas de animación.
 *
 * Cada ventana del pool carga `overlay.html`, que apunta aquí. Antes todas
 * cargaban el mismo `index.html` que la ventana de control, con lo que cada
 * overlay parseaba y ejecutaba el editor, la biblioteca, los ajustes y el
 * fondo animado de Inicio — código que no usa nunca. Con el motor web creando
 * un proceso por ventana, ese coste se multiplicaba por el tamaño del pool.
 */
suppressBrowserContextMenu();
makeWindowTransparent();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OverlayItemApp />
  </React.StrictMode>,
);
