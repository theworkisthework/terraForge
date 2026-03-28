import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { resolve } from "path";

export default defineConfig({
  plugins: [svgr(), react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main/index.ts", "src/preload/index.ts"],
    },
    // Node environment for main-process tests
    environmentMatchGlobs: [
      ["tests/unit/taskManager*", "node"],
      ["tests/unit/fluidnc*", "node"],
      ["tests/unit/serial*", "node"],
    ],
  },
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@types": resolve(__dirname, "src/types"),
    },
  },
});
