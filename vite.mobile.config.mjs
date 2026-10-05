import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { request as httpRequest } from "node:http";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";

// Dev only. A browser page can't call the plotter's plain-HTTP REST API
// cross-origin unless FluidNC sends CORS headers (the Electron app doesn't
// care because Node has no CORS). This forwards /__fluidnc/<host:port>/<path>
// to http://<host:port>/<path> from the dev server so browser testing works.
// The Android app uses native HTTP and never goes through this.
function fluidncDevProxy() {
  return {
    name: "fluidnc-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/__fluidnc", (req, res) => {
        const m = /^\/([^/]+)(\/.*)?$/.exec(req.url ?? "");
        if (!m) {
          res.statusCode = 400;
          return res.end("bad proxy path");
        }
        const [host, port] = m[1].split(":");
        const upstream = httpRequest(
          {
            host,
            port: Number(port) || 80,
            path: m[2] ?? "/",
            method: req.method,
            headers: { ...req.headers, host: m[1] },
          },
          (up) => {
            res.writeHead(up.statusCode ?? 502, up.headers);
            up.pipe(res);
          },
        );
        upstream.on("error", (err) => {
          res.statusCode = 502;
          res.end(`proxy error: ${err.message}`);
        });
        req.pipe(upstream);
      });
    },
  };
}

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Builds the existing React renderer for Capacitor (Android/iOS WebView).
// Entry is src/mobile (installs the window.terraForge shim, then boots the
// unmodified renderer). Output goes to dist-mobile, which capacitor.config.ts
// points at as webDir.
export default defineConfig({
  root: resolve(import.meta.dirname, "src/mobile"),
  base: "./",
  plugins: [svgr(), react(), tailwindcss(), fluidncDevProxy()],
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
