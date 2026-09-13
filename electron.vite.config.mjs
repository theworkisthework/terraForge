import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Preload and renderer are at the electron-vite default locations so no
// explicit entry overrides are needed for them.
// externalizeDepsPlugin is deprecated in electron-vite v5 — dependency
// externalisation is now enabled by default via build.externalizeDeps.
export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          // The default single-entry preload build only bundles
          // src/preload/index.ts. pluginSandboxPreload is a second preload:
          // the message bridge for the sandboxed bitmap-plugin host windows
          // (see src/main/plugins/pluginHostManager.ts). Nothing imports it,
          // so it has to be named explicitly to be bundled at all.
          index: resolve(__dirname, "src/preload/index.ts"),
          pluginSandboxPreload: resolve(__dirname, "src/preload/pluginSandboxPreload.ts"),
        },
      },
    },
  },
  renderer: {
    plugins: [svgr(), react(), tailwindcss()],
  },
});
