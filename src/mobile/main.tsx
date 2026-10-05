import React from "react";
import ReactDOM from "react-dom/client";
import { installMobileApi } from "./api";
import "./mobile.css";

// The Electron preload normally defines window.terraForge before the renderer
// loads. On mobile we install the shim first, then boot the mobile-first UI.
installMobileApi();

const { default: App } = await import("./ui/MobileApp");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
