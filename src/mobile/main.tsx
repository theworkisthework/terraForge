import React from "react";
import ReactDOM from "react-dom/client";
import { installMobileApi } from "./api";
import { installTouchBridge } from "./touchBridge";
import "./mobile.css";

// The Electron preload normally defines window.terraForge before the renderer
// loads. On mobile we install the shim first, then boot the same App.
installMobileApi();
installTouchBridge();

const { default: App } = await import("../renderer/src/App");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
