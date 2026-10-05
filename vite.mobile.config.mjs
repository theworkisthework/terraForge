import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Builds the existing React renderer for Capacitor (Android/iOS WebView).
// Entry is src/mobile (installs the window.terraForge shim, then boots the
// unmodified renderer). Output goes to dist-mobile, which capacitor.config.ts
// points at as webDir.
export default defineConfig({
  root: resolve(import.meta.dirname, "src/mobile"),
  base: "./",
  plugins: [svgr(), react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // TaskManager extends Node's EventEmitter; use the npm polyfill.
      events: "events/",
    },
  },
  worker: { format: "es" },
  build: {
    outDir: resolve(import.meta.dirname, "dist-mobile"),
    emptyOutDir: true,
    target: "es2022", // top-level await in src/mobile/main.tsx
    chunkSizeWarningLimit: 2500,
  },
  server: { fs: { allow: [resolve(import.meta.dirname)] } },
});
