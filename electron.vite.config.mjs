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
  main: {
    build: {
      rollupOptions: {
        input: {
          // The default single-entry main build only bundles src/main/index.ts.
          // pluginHostEntry is a second, separate main-process entry: it's the
          // script forked into its own utilityProcess per installed bitmap
          // plugin (see src/main/plugins/pluginHostEntry.ts), never imported
          // by index.ts, so it must be named explicitly here to be bundled at
          // all. Its build output must also stay outside app.asar — see the
          // "asarUnpack" entry in package.json's build config.
          index: resolve(__dirname, "src/main/index.ts"),
          pluginHostEntry: resolve(__dirname, "src/main/plugins/pluginHostEntry.ts"),
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [svgr(), react(), tailwindcss()],
  },
});
