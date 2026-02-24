import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Files are at the electron-vite default locations (src/main, src/preload, src/renderer)
// so no explicit entry overrides are needed.
// externalizeDepsPlugin is deprecated in electron-vite v5 — dependency
// externalisation is now enabled by default via build.externalizeDeps.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
