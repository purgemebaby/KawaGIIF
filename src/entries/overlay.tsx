import React from "react";
import ReactDOM from "react-dom/client";
import OverlayItemApp from "../windows/OverlayItemApp";
import { makeWindowTransparent, suppressBrowserContextMenu } from "./shared";
import "../styles/overlay.css";

suppressBrowserContextMenu();
makeWindowTransparent();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OverlayItemApp />
  </React.StrictMode>,
);
