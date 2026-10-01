import React from "react";
import ReactDOM from "react-dom/client";
import ControlApp from "./windows/ControlApp";
import { suppressBrowserContextMenu } from "./entries/shared";
import "./styles/index.css";

suppressBrowserContextMenu();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ControlApp />
  </React.StrictMode>,
);
