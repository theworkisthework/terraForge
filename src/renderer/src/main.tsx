import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installUnexpectedErrorHandlers } from "./utils/unexpectedErrors";

// Before anything renders: an error on the way up is the one most worth seeing.
installUnexpectedErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
