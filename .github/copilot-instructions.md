# terraForge — Workspace Instructions

Cross-platform Electron + React app for controlling FluidNC-based pen plotters (TerraPen).
Pipeline: SVG/PDF import → canvas editing → G-code generation → FluidNC machine control.

## Architecture

```
src/main/          Electron main process — all system I/O (file, serial, network)
src/preload/       contextBridge exposes window.terraForge IPC API
src/renderer/src/  React UI: components/, store/, utils/
src/workers/       gcodeEngine.ts, svgWorker.ts — heavy work off renderer thread
src/machine/       FluidNC REST + WebSocket client (fluidnc.ts, serial.ts)
src/tasks/         Background task orchestration (taskManager.ts)
src/types/         Shared TypeScript interfaces — single source of truth
```

Full spec: [docs/terraForge-spec.md](../docs/terraForge-spec.md)
Feature status: [docs/terraForge-features.md](../docs/terraForge-features.md)

## Build & Test

```sh
npm run dev            # Electron dev server with hot reload
npm run build          # Production build -> out/
npm test               # Vitest unit + component tests (run after changes)
npm run test:watch     # Watch mode
npm run test:coverage  # With Istanbul coverage
npm run test:e2e       # Playwright E2E (builds first)
npm run typecheck      # TypeScript strict check across all tsconfigs
```

- Unit tests: `tests/unit/` — Node or jsdom depending on module
- Component tests: `tests/component/` — jsdom + React Testing Library
- E2E: `tests/e2e/*.spec.ts` — Playwright against real Electron build
- Fix failing tests when making significant changes; update spec/features docs accordingly

## Tech Stack — Hard Rules

- **React 19 functional components only** — no class components
- **Zustand** for state (canvasStore, machineStore, taskStore, consoleStore) — no Redux
- **TailwindCSS** for styling — no CSS-in-JS
- **TypeScript everywhere** — typed IPC boundaries, no `any` at system edges
- **No Node APIs in renderer** — all file/network/serial access via `window.terraForge` IPC

## IPC Contract (`window.terraForge`)

```ts
// Machine
fluidnc.getStatus() | sendCommand(cmd) | pauseJob() | resumeJob() | abortJob()
fluidnc.listFiles(path) | listSDFiles(path) | uploadFile() | deleteFile() | runFile()
fluidnc.connectWebSocket(host, port, wsPort) | disconnectWebSocket()
fluidnc.onStatusUpdate(cb) | onConsoleMessage(cb) | onFirmwareInfo(cb)

// Serial
serial.listPorts() | connect(path, baud) | disconnect() | send(data) | onData(cb)

// File I/O
fs.openSvgDialog() | openPdfDialog() | openFileDialog() | readFile() | writeFile() | saveGcodeDialog()

// Jobs & Tasks
jobs.generateGcode(taskId, objects, config, options)   // runs in Web Worker
tasks.cancel(taskId) | onTaskUpdate(cb)

// Config
config.getMachineConfigs() | saveMachineConfig() | deleteMachineConfig() | exportConfigs() | importConfigs()
```

## Conventions

**State management:**
- Zustand stores use immer (enabled automatically via `immer` middleware)
- Cancel callbacks for long-running tasks live in a **module-level Map**, never inside immer state

**Types:**
- All shared interfaces live in `src/types/index.ts` — do not scatter types across files
- Key models: `MachineConfig`, `VectorObject`, `SvgImport`, `BackgroundTask`, `Job`

**Long-running tasks:**
- Must report progress (0-100 or `null`), support cancellation, and update task status in UI
- G-code generation must run in `svgWorker.ts` — never block the renderer

**IPC channels** follow `namespace:action` pattern (e.g., `fluidnc:getStatus`, `tasks:cancel`)

## FluidNC Integration Rules

Only use documented REST endpoints:
`/command`, `/state`, `/files`, `/upload`, `/delete`, `/run`, `/pause`, `/resume`, `/abort`

WebSocket `/ws` streams console output and machine status.

**Never invent FluidNC endpoints.** If uncertain, consult docs/terraForge-spec.md.
