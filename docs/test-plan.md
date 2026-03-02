# terraForge — Comprehensive Test Plan

## Current State

- **No test framework is configured** — no Vitest, Jest, or Playwright in `package.json`
- **No test files exist** in the project
- All code is TypeScript; the renderer uses React 19 + Zustand + TailwindCSS

---

## 1 Recommended Test Stack

| Layer                                            | Tool                                       | Why                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Unit tests** (pure functions, workers, stores) | **Vitest**                                 | Shares the Vite toolchain already in use; near-zero config; native ESM + TypeScript; worker threads support           |
| **Component tests** (React UI)                   | **Vitest + React Testing Library + jsdom** | RTL is the de-facto standard for React component tests; Vitest can use `jsdom` or `happy-dom` as the test environment |
| **E2E tests** (full Electron app)                | **Playwright + electron**                  | Playwright has first-class Electron support (`electron.launch()`); exercises real IPC, real window, real filesystem   |
| **Coverage**                                     | **Vitest's built-in c8/istanbul**          | Zero-config with Vitest                                                                                               |

### Dependency Installation

```bash
npm i -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event \
         jsdom happy-dom @playwright/test playwright-core
```

---

## 2 Configuration Files

### 2.1 `vitest.config.ts` (project root)

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true, // describe/it/expect without imports
    environment: "jsdom", // default for component tests
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main/index.ts", "src/preload/index.ts"],
    },
    // Separate environment for Node-side tests (TaskManager, FluidNC, Serial)
    environmentMatchGlobs: [
      ["tests/unit/main/**", "node"],
      ["tests/unit/machine/**", "node"],
      ["tests/unit/tasks/**", "node"],
    ],
  },
  resolve: {
    alias: {
      "@renderer": "/src/renderer/src",
      "@types": "/src/types",
    },
  },
});
```

### 2.2 `tests/setup.ts`

```ts
import "@testing-library/jest-dom/vitest";

// Mock window.terraForge for all renderer tests
const noOp = () => Promise.resolve();
const noOpReturn = (..._: any[]) => Promise.resolve(undefined as any);
(globalThis as any).window ??= globalThis;
(window as any).terraForge = {
  fluidnc: {
    getStatus: noOpReturn,
    sendCommand: noOpReturn,
    listFiles: noOpReturn,
    listSDFiles: noOpReturn,
    uploadFile: noOpReturn,
    downloadFile: noOpReturn,
    fetchFileText: noOpReturn,
    deleteFile: noOpReturn,
    runFile: noOpReturn,
    uploadGcode: noOpReturn,
    pauseJob: noOp,
    resumeJob: noOp,
    abortJob: noOp,
    connectWebSocket: noOp,
    disconnectWebSocket: noOp,
    onStatusUpdate: () => () => {},
    onConsoleMessage: () => () => {},
    onPing: () => () => {},
  },
  serial: {
    listPorts: () => Promise.resolve([]),
    connect: noOp,
    disconnect: noOp,
    send: noOp,
    onData: () => () => {},
  },
  fs: {
    openSvgDialog: noOpReturn,
    openFileDialog: noOpReturn,
    openGcodeDialog: noOpReturn,
    readFile: noOpReturn,
    writeFile: noOp,
    saveGcodeDialog: noOpReturn,
    saveFileDialog: noOpReturn,
    loadConfigs: () => Promise.resolve([]),
    saveConfigs: noOp,
  },
  tasks: {
    cancel: noOp,
    onTaskUpdate: () => () => {},
  },
  jobs: {
    generateGcode: noOpReturn,
  },
  config: {
    getMachineConfigs: () => Promise.resolve([]),
    saveMachineConfig: noOp,
    deleteMachineConfig: noOp,
    exportConfigs: noOpReturn,
    importConfigs: () => Promise.resolve({ added: 0, skipped: 0 }),
  },
};
```

### 2.3 `package.json` scripts (add)

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
  },
}
```

### 2.4 `playwright.config.ts` (for E2E)

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    trace: "on-first-retry",
  },
});
```

---

## 3 Directory Structure

```
tests/
├── setup.ts                          # Global test setup / mocks
├── fixtures/
│   ├── simple-rect.svg               # Minimal SVG with a <rect>
│   ├── circle.svg                    # <circle> element
│   ├── complex-paths.svg             # Nested <g> with transforms
│   ├── inkscape-layers.svg           # Inkscape-style matrix transforms
│   ├── units-mm.svg                  # width="100mm" height="50mm"
│   ├── units-in.svg                  # width="2in" height="3in"
│   ├── viewbox-offset.svg            # Non-zero viewBox origin
│   ├── sample.gcode                  # Simple G-code for parser tests
│   ├── imperial.gcode                # G20 inch-mode G-code
│   ├── relative.gcode                # G91 relative G-code
│   └── machine-configs.json          # Sample export file
├── helpers/
│   ├── factories.ts                  # Test data factories (MachineConfig, VectorObject, SvgImport, etc.)
│   └── renderWithProviders.tsx       # Render wrapper for component tests
├── unit/
│   ├── gcodeParser.test.ts
│   ├── svgTransform.test.ts
│   ├── svgWorker.test.ts
│   ├── tasks/
│   │   └── taskManager.test.ts
│   ├── machine/
│   │   ├── fluidnc.test.ts
│   │   └── serial.test.ts
│   └── stores/
│       ├── canvasStore.test.ts
│       ├── machineStore.test.ts
│       ├── taskStore.test.ts
│       └── consoleStore.test.ts
├── component/
│   ├── ConsolePanel.test.tsx
│   ├── FileBrowserPanel.test.tsx
│   ├── JobControls.test.tsx
│   ├── JogControls.test.tsx
│   ├── MachineConfigDialog.test.tsx
│   ├── PlotCanvas.test.tsx
│   ├── PropertiesPanel.test.tsx
│   ├── TaskBar.test.tsx
│   ├── Toolbar.test.tsx
│   └── App.test.tsx
└── e2e/
    ├── launch.spec.ts
    ├── svg-import.spec.ts
    ├── gcode-generation.spec.ts
    ├── machine-config.spec.ts
    ├── file-browser.spec.ts
    └── helpers/
        └── electronApp.ts            # Shared Playwright Electron launcher
```

---

## 4 Unit Tests — Pure Functions

### 4.1 `gcodeParser.test.ts`

Targets: `parseGcode()` from [src/renderer/src/utils/gcodeParser.ts](src/renderer/src/utils/gcodeParser.ts)

| #   | Test Case                        | What It Verifies                                            |
| --- | -------------------------------- | ----------------------------------------------------------- |
| 1   | Empty string input               | Returns empty paths, zero bounds, `lineCount: 0`            |
| 2   | Comments-only G-code             | Lines with `;` and `(...)` are stripped; no motion produced |
| 3   | Simple G0 rapid                  | `rapids` contains correct `M ... L ...` segments            |
| 4   | Simple G1 feed move              | `cuts` contains correct `M ... L ...` segments              |
| 5   | Mixed G0/G1 sequence             | Rapids and cuts are separated into correct path strings     |
| 6   | G2/G3 arc approximation          | Arc commands produce `cuts` output (linearised)             |
| 7   | G20 inch mode                    | Coordinates scaled by 25.4                                  |
| 8   | G21 mm mode (explicit)           | No scaling applied                                          |
| 9   | G90 absolute mode                | Coordinates used as-is                                      |
| 10  | G91 relative mode                | Coordinates accumulated incrementally                       |
| 11  | Mixed absolute/relative          | Mode switch mid-file respected                              |
| 12  | Modal G-code (no G word on line) | `G1` then `X10 Y10` — uses last motion mode                 |
| 13  | Line number prefix `N100 G1 X10` | Parsed correctly; `lineCount` incremented                   |
| 14  | Block delete `/G1 X5 Y5`         | `/` prefix stripped, command still parsed                   |
| 15  | Bounds calculation               | `bounds.minX/maxX/minY/maxY` match expected extents         |
| 16  | Large file (1000+ lines)         | Parses without error; `lineCount` matches                   |
| 17  | No X/Y on line                   | Lines with only G/F/S words are skipped (no path output)    |

### 4.2 `svgTransform.test.ts`

Targets: `applyMatrixToPathD()`, `computePathsBounds()`, `getAccumulatedTransform()` from [src/renderer/src/utils/svgTransform.ts](src/renderer/src/utils/svgTransform.ts)

**`applyMatrixToPathD`**

| #   | Test Case                                             | What It Verifies                                                                           |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Identity matrix                                       | Output equals input (fast path)                                                            |
| 2   | Pure translation `translate(10, 20)`                  | All coordinates shifted by (10, 20)                                                        |
| 3   | Uniform scale `scale(2)`                              | All coordinates doubled                                                                    |
| 4   | Non-uniform scale `scale(2, 3)`                       | X doubled, Y tripled                                                                       |
| 5   | 90° rotation                                          | Coordinates rotated correctly                                                              |
| 6   | Arbitrary matrix                                      | Composed transform applied to all point types                                              |
| 7   | Relative commands (h, v, l, c, s, q, t, a) → absolute | Relative variants converted before transform                                               |
| 8   | H command → L expansion                               | `H 10` becomes `L x,y` with correct coordinates                                            |
| 9   | V command → L expansion                               | `V 10` becomes `L x,y` with correct coordinates                                            |
| 10  | Cubic bezier (C command)                              | All 3 control point pairs transformed                                                      |
| 11  | Smooth cubic (S command)                              | Control points transformed                                                                 |
| 12  | Quadratic bezier (Q command)                          | Control point + endpoint transformed                                                       |
| 13  | Smooth quadratic (T command)                          | Endpoint transformed                                                                       |
| 14  | Arc (A command)                                       | `rx`, `ry`, rotation angle, and endpoint all transformed; sweep flag flipped on reflection |
| 15  | Z (closepath)                                         | Preserved in output                                                                        |
| 16  | Multi-segment M (implicit L)                          | Subsequent M coordinates treated as L                                                      |
| 17  | Empty path `d=""`                                     | Returns empty string                                                                       |

**`computePathsBounds`**

| #   | Test Case                                                        |
| --- | ---------------------------------------------------------------- |
| 18  | Single line path → correct AABB                                  |
| 19  | Multiple paths → union of all bounds                             |
| 20  | Empty array → returns `null`                                     |
| 21  | Path with only Z commands → returns `null`                       |
| 22  | Path with arcs → endpoint included in bounds                     |
| 23  | Path with cubic beziers → control points included (conservative) |

**`getAccumulatedTransform`** (requires DOM / `DOMParser`)

| #   | Test Case                                                    |
| --- | ------------------------------------------------------------ |
| 24  | Element with no transforms → identity matrix                 |
| 25  | Element with `transform="translate(10,20)"` → correct matrix |
| 26  | Nested `<g>` transforms multiplied outer → inner             |
| 27  | `<svg>` root not included in accumulation                    |

### 4.3 `svgWorker.test.ts`

Targets: The worker logic from [src/workers/svgWorker.ts](src/workers/svgWorker.ts). Since the file runs as a Web Worker, tests must either:

- **Option A:** Extract the pure functions (`tokenizePath`, `toAbsolute`, `flattenToSubpaths`, `nearestNeighbourSort`, `transformPt`, `cubicBezier`, `quadBezier`, `arcToBeziers`) into a shared module and test them directly.
- **Option B:** Use Vitest's `new Worker()` support to post messages and assert on responses.

**Recommended approach:** Option A for logic; Option B for integration.

**Pure function tests (extract or import):**

| #   | Test Case                                    | Target Function                |
| --- | -------------------------------------------- | ------------------------------ |
| 1   | Tokenize `M 0 0 L 10 10 Z`                   | `tokenizePath`                 |
| 2   | Tokenize path with negative numbers          | `tokenizePath`                 |
| 3   | Tokenize comma-separated args                | `tokenizePath`                 |
| 4   | Relative → absolute conversion               | `toAbsolute`                   |
| 5   | M with implicit L segments                   | `toAbsolute`                   |
| 6   | H/V relative conversion                      | `toAbsolute`                   |
| 7   | Transform point — bottom-left origin         | `transformPt`                  |
| 8   | Transform point — top-left origin            | `transformPt`                  |
| 9   | Transform point — center origin              | `transformPt`                  |
| 10  | Transform point — with scale                 | `transformPt`                  |
| 11  | Transform point — with rotation              | `transformPt`                  |
| 12  | Flatten simple rect path → 4 subpaths        | `flattenToSubpaths`            |
| 13  | Flatten path with cubic bezier               | `flattenToSubpaths`            |
| 14  | Flatten path with quadratic bezier           | `flattenToSubpaths`            |
| 15  | Flatten path with arc                        | `flattenToSubpaths`            |
| 16  | Nearest-neighbour sort — empty               | `nearestNeighbourSort`         |
| 17  | Nearest-neighbour sort — single              | `nearestNeighbourSort`         |
| 18  | Nearest-neighbour sort — picks closest first | `nearestNeighbourSort`         |
| 19  | Cubic bezier flatness threshold              | `cubicBezier`/`subdivideCubic` |
| 20  | Degenerate arc (rx=0 or ry=0)                | `arcToBeziers`                 |
| 21  | Arc with same start/end                      | `arcToBeziers`                 |

**Worker message integration tests:**

| #   | Test Case                                                                    |
| --- | ---------------------------------------------------------------------------- |
| 22  | `generate` with single visible object → `complete` message with valid G-code |
| 23  | `generate` with no visible objects → `complete` with header only             |
| 24  | `cancel` during generation → `cancelled` message (not `error`)               |
| 25  | `generate` with `optimisePaths: true` → optimised output with NN reorder     |
| 26  | `progress` messages received during generation                               |
| 27  | G-code header contains machine name, bed size, origin, timestamp             |
| 28  | Pen up/down commands match config                                            |
| 29  | G-code starts with `G90` and `G21`                                           |
| 30  | G-code ends with return-to-origin and pen up                                 |
| 31  | All five origin modes produce valid coordinates                              |

### 4.4 `taskManager.test.ts`

Targets: `TaskManager` from [src/tasks/taskManager.ts](src/tasks/taskManager.ts) — Node environment

| #   | Test Case                                                   |
| --- | ----------------------------------------------------------- |
| 1   | `create()` emits `task-update` with status `"running"`      |
| 2   | `update()` patches progress and emits                       |
| 3   | `update()` on completed task is a no-op                     |
| 4   | `complete()` sets status `"completed"` and progress `100`   |
| 5   | `fail()` sets status `"error"` and error message            |
| 6   | `cancel()` sets status `"cancelled"` and adds to cancel set |
| 7   | `isCancelled()` returns true for cancelled IDs              |
| 8   | `get()` returns task by ID                                  |
| 9   | `getAll()` returns all tasks                                |
| 10  | Task auto-deletes 5 s after `complete()`                    |
| 11  | Multiple concurrent tasks tracked independently             |

### 4.5 `fluidnc.test.ts`

Targets: `FluidNCClient` from [src/machine/fluidnc.ts](src/machine/fluidnc.ts) — Node environment, network calls mocked

| #   | Test Case                                                         |
| --- | ----------------------------------------------------------------- |
| 1   | `setHost()` sets `baseUrl` correctly                              |
| 2   | `getStatus()` parses `<Idle\|MPos:0,0,0>` correctly               |
| 3   | `getStatus()` parses Hold, Run, Alarm, etc.                       |
| 4   | `getStatus()` handles `Ln:42,1234` line numbers                   |
| 5   | `getStatus()` maps unknown states to `"Unknown"`                  |
| 6   | `sendCommand()` — 4.x uses GET `/command?plain=...`               |
| 7   | `sendCommand()` — 3.x uses POST `/command`                        |
| 8   | `listFiles()` parses JSON response into `RemoteFile[]`            |
| 9   | `listSDFiles()` parses SD JSON response with `-1` size dirs       |
| 10  | `listSDFiles()` throws on SD card error status                    |
| 11  | `deleteFile()` — 4.x uses REST DELETE                             |
| 12  | `deleteFile()` — 3.x uses `$SD/Delete=` command                   |
| 13  | `runFile()` sends correct `$SD/Run=` command                      |
| 14  | `pauseJob()` sends `!` realtime char                              |
| 15  | `resumeJob()` sends `~` realtime char                             |
| 16  | `abortJob()` sends `\x18` soft reset                              |
| 17  | `fetchFileText()` routes to `/sd/` or `/localfs/` prefix          |
| 18  | `uploadFile()` sends multipart form with progress callback        |
| 19  | `downloadFile()` streams to file with progress callback           |
| 20  | `probeFirmwareVersion()` parses ESP800 response for v4.x          |
| 21  | `probeFirmwareVersion()` parses ESP800 response for v3.x          |
| 22  | `probeFirmwareVersion()` extracts WS port from `webcommunication` |
| 23  | `probeFirmwareVersion()` falls back through strategies            |
| 24  | `connectWebSocket()` detects WS port from probe                   |
| 25  | `connectWebSocket()` uses explicit `wsPort` override              |
| 26  | `disconnectWebSocket()` terminates socket and clears state        |
| 27  | WebSocket reconnect on close with exponential backoff             |
| 28  | Generation counter prevents stale WS events                       |

### 4.6 `serial.test.ts`

Targets: `SerialClient` and `parseFluidNCStatus()` from [src/machine/serial.ts](src/machine/serial.ts) — Node environment

| #   | Test Case                                              |
| --- | ------------------------------------------------------ |
| 1   | `parseFluidNCStatus()` — Idle with MPos                |
| 2   | `parseFluidNCStatus()` — Run with WPos                 |
| 3   | `parseFluidNCStatus()` — Alarm state                   |
| 4   | `parseFluidNCStatus()` — Hold:0 substates              |
| 5   | `parseFluidNCStatus()` — Ln: line numbers              |
| 6   | `parseFluidNCStatus()` — Unknown state fallback        |
| 7   | `parseListLines()` — SD `[FILE: name\|SIZE:1234]`      |
| 8   | `parseListLines()` — SD `[DIR:dirname]`                |
| 9   | `parseListLines()` — LocalFS `[FILE:/name\|SIZE:1234]` |
| 10  | `parseListLines()` — top-level-only filtering          |
| 11  | `sendAndReceive()` resolves on `ok`                    |
| 12  | `sendAndReceive()` rejects on `error:N`                |
| 13  | `sendAndReceive()` times out                           |
| 14  | Command queue serialisation                            |
| 15  | Status lines (`<...>`) not captured by command queue   |
| 16  | `sendRealtime()` sends single char without newline     |

---

## 5 Unit Tests — Zustand Stores

Store tests run outside React by calling the store actions directly and asserting state.

### 5.1 `canvasStore.test.ts`

| #   | Test Case                                                        |
| --- | ---------------------------------------------------------------- |
| 1   | `addImport()` adds to imports array                              |
| 2   | `removeImport()` removes by ID and clears selection if selected  |
| 3   | `updateImport()` merges patch into matching import               |
| 4   | `updatePath()` patches a specific path within an import          |
| 5   | `removePath()` removes a specific path                           |
| 6   | `selectImport()` sets `selectedImportId`                         |
| 7   | `selectImport(null)` deselects                                   |
| 8   | `clearImports()` empties everything                              |
| 9   | `selectedImport()` returns the matching import                   |
| 10  | `setGcodeToolpath()` stores the toolpath                         |
| 11  | `toVectorObjects()` flattens visible imports/paths only          |
| 12  | `toVectorObjects()` excludes hidden imports                      |
| 13  | `toVectorObjects()` excludes hidden paths within visible imports |

### 5.2 `machineStore.test.ts`

| #   | Test Case                                               |
| --- | ------------------------------------------------------- |
| 1   | `setConfigs()` populates configs and auto-selects first |
| 2   | `setActiveConfigId()` changes active selection          |
| 3   | `setStatus()` stores machine status                     |
| 4   | `setConnected(false)` also sets `wsLive` to false       |
| 5   | `setSelectedJobFile()` stores / clears job file         |
| 6   | `activeConfig()` returns the active config object       |
| 7   | `addConfig()` appends and calls IPC persist             |
| 8   | `updateConfig()` patches and persists                   |
| 9   | `deleteConfig()` removes and selects next               |
| 10  | `reorderConfigs()` reorders and persists                |

### 5.3 `taskStore.test.ts`

| #   | Test Case                                                    |
| --- | ------------------------------------------------------------ |
| 1   | `upsertTask()` adds a new task                               |
| 2   | `upsertTask()` updates an existing task                      |
| 3   | `removeTask()` deletes task and cancel callback              |
| 4   | `registerCancelCallback()` + `cancelTask()` invokes callback |
| 5   | `cancelTask()` falls back to IPC when no callback registered |
| 6   | `activeTasks()` returns only running tasks                   |

### 5.4 `consoleStore.test.ts`

| #   | Test Case                                   |
| --- | ------------------------------------------- |
| 1   | `appendLine()` adds to lines                |
| 2   | Lines capped at `maxLines` (oldest trimmed) |
| 3   | `clear()` empties lines array               |

---

## 6 Component Tests (React Testing Library)

All component tests render the component in isolation with mocked stores and `window.terraForge`. Use `@testing-library/user-event` for interactions.

### 6.1 `ConsolePanel.test.tsx` (161 LOC)

| #   | Test Case                                                       |
| --- | --------------------------------------------------------------- |
| 1   | Renders console lines from store                                |
| 2   | Auto-scrolls to bottom on new lines                             |
| 3   | Clear button empties console                                    |
| 4   | Command input sends via `window.terraForge.fluidnc.sendCommand` |
| 5   | Alarm badge visible when status is "Alarm"                      |
| 6   | Clicking alarm badge sends `$X`                                 |
| 7   | Firmware restart button visible when connected                  |
| 8   | Restart button sends `[ESP444]RESTART` with confirmation        |
| 9   | JobControls sub-component is rendered                           |

### 6.2 `FileBrowserPanel.test.tsx` (473 LOC)

| #   | Test Case                                                       |
| --- | --------------------------------------------------------------- |
| 1   | Shows "Not connected" when disconnected                         |
| 2   | Lists files from `listSDFiles()` on mount when connected        |
| 3   | Clicking a folder navigates into it                             |
| 4   | Breadcrumb navigation works                                     |
| 5   | Upload button calls `openFileDialog()` then `uploadFile()`      |
| 6   | Download button calls `downloadFile()` with correct save dialog |
| 7   | Delete button calls `deleteFile()` and refreshes listing        |
| 8   | ▶ run button calls `runFile()`                                  |
| 9   | Clicking a `.gcode` file row selects it as queued job           |
| 10  | Clicking again deselects                                        |
| 11  | G-code preview button loads toolpath                            |
| 12  | Non-G-code files don't show preview button                      |
| 13  | File size displayed for each entry                              |

### 6.3 `JobControls.test.tsx` (201 LOC)

| #   | Test Case                                                 |
| --- | --------------------------------------------------------- |
| 1   | Start button disabled when no job file selected           |
| 2   | Start button enabled when job file selected and connected |
| 3   | Start sends `runFile()` for SD files                      |
| 4   | Start uploads then runs for local files                   |
| 5   | Pause calls `pauseJob()`                                  |
| 6   | Resume calls `resumeJob()`                                |
| 7   | Abort calls `abortJob()`                                  |
| 8   | Progress bar shown when status is `Run` with line numbers |
| 9   | Indeterminate progress when no line total                 |
| 10  | Running / Paused labels shown on correct states           |
| 11  | Non-G-code file warning displayed                         |

### 6.4 `JogControls.test.tsx` (111 LOC)

| #   | Test Case                                            |
| --- | ---------------------------------------------------- |
| 1   | Renders X+, X−, Y+, Y−, Z+, Z− buttons               |
| 2   | Step selector toggles between 0.1 / 1 / 10 / 100     |
| 3   | Clicking X+ sends `$J=G91 X{step} F{feedrate}`       |
| 4   | Clicking Y- sends `$J=G91 Y-{step} F{feedrate}`      |
| 5   | Z buttons send Z jog commands                        |
| 6   | Go-to-origin button sends `G0 X0 Y0`                 |
| 7   | Feed rate input updates the jog feedrate             |
| 8   | `onClose` callback invoked when close button clicked |

### 6.5 `MachineConfigDialog.test.tsx` (733 LOC)

| #   | Test Case                                                  |
| --- | ---------------------------------------------------------- |
| 1   | Renders config list from store                             |
| 2   | Selecting a config shows its form fields                   |
| 3   | Adding a new config creates a blank entry                  |
| 4   | Deleting a config removes it                               |
| 5   | Duplicate button clones with "Copy of …" prefix            |
| 6   | Form fields disabled when connected (read-only mode)       |
| 7   | Changing pen type auto-populates default commands          |
| 8   | Pen type change prompts before overwriting custom values   |
| 9   | Swap button reverses up/down commands                      |
| 10  | Reset button restores type defaults                        |
| 11  | All five origin modes selectable                           |
| 12  | Connection type toggle between Wi-Fi and USB               |
| 13  | WebSocket port override field present                      |
| 14  | Export button triggers `exportConfigs()`                   |
| 15  | Import button triggers `importConfigs()` and shows result  |
| 16  | Drag-and-drop reorder (mock `@dnd-kit`) persists new order |
| 17  | `onClose` callback invoked when dialog closed              |

### 6.6 `PlotCanvas.test.tsx` (1239 LOC)

| #   | Test Case                                              |
| --- | ------------------------------------------------------ |
| 1   | Renders bed grid with correct dimensions from config   |
| 2   | Origin marker at correct position for each origin mode |
| 3   | SVG imports rendered on canvas                         |
| 4   | Clicking an import selects it                          |
| 5   | Escape key deselects                                   |
| 6   | Delete key removes selected import                     |
| 7   | Bounding box handles rendered for selected import      |
| 8   | Zoom percentage badge visible                          |
| 9   | Scroll wheel changes zoom level                        |
| 10  | Fit-to-view button centers bed                         |
| 11  | G-code toolpath overlay renders cuts and rapids        |
| 12  | Non-scaling-stroke applied to paths                    |
| 13  | Middle mouse button drag pans canvas                   |
| 14  | Space key toggles pan mode                             |

### 6.7 `PropertiesPanel.test.tsx` (277 LOC)

| #   | Test Case                                                 |
| --- | --------------------------------------------------------- |
| 1   | Shows "No selection" when nothing selected                |
| 2   | Shows import properties when selected                     |
| 3   | Import name editable by double-click                      |
| 4   | X/Y position inputs update import position                |
| 5   | Width/Height inputs update scale (aspect ratio preserved) |
| 6   | Scale input updates import scale                          |
| 7   | Visibility toggle hides/shows import                      |
| 8   | Path list expandable via ▸/▾ toggle                       |
| 9   | Per-path visibility toggle                                |
| 10  | Per-path remove button                                    |
| 11  | Delete button removes entire import                       |

### 6.8 `TaskBar.test.tsx` (131 LOC)

| #   | Test Case                                          |
| --- | -------------------------------------------------- |
| 1   | No toasts when no tasks                            |
| 2   | Running task shows progress bar                    |
| 3   | Running task with `null` progress shows spinner    |
| 4   | Completed task auto-dismisses after 8s             |
| 5   | Error task does NOT auto-dismiss                   |
| 6   | Error task shows error message                     |
| 7   | Cancel button on running task calls `cancelTask()` |
| 8   | Tooltip shows full label on truncated text         |
| 9   | Status icons: ✓ green, ✕ red, ! red                |

### 6.9 `Toolbar.test.tsx` (855 LOC)

| #   | Test Case                                           |
| --- | --------------------------------------------------- |
| 1   | Import SVG button opens file dialog                 |
| 2   | Import G-code button opens filtered dialog          |
| 3   | Machine selector dropdown shows configs             |
| 4   | Machine selector disabled when connected            |
| 5   | Connect button calls `connectWebSocket()`           |
| 6   | Disconnect button calls `disconnectWebSocket()`     |
| 7   | Connection status indicator green when connected    |
| 8   | Position display shows X/Y/Z coordinates            |
| 9   | Machine state badge shows current state             |
| 10  | Homing button sends `$H`                            |
| 11  | Homing button disabled when not connected           |
| 12  | Generate G-code button triggers worker              |
| 13  | Generate & optimise option in split-button dropdown |
| 14  | Jog toggle opens/closes jog panel                   |
| 15  | Config button opens MachineConfigDialog             |

### 6.10 `App.test.tsx` (86 LOC)

| #   | Test Case                                                                     |
| --- | ----------------------------------------------------------------------------- |
| 1   | Renders without crashing                                                      |
| 2   | All major panels present (toolbar, file browser, canvas, properties, console) |
| 3   | Machine configs loaded on mount                                               |
| 4   | IPC listeners registered on mount                                             |
| 5   | IPC listeners cleaned up on unmount                                           |

---

## 7 End-to-End Tests (Playwright + Electron)

### 7.1 Shared Helper: `electronApp.ts`

```ts
import { _electron as electron } from "@playwright/test";

export async function launchApp() {
  const app = await electron.launch({
    args: ["."], // launch from project root
    env: { NODE_ENV: "test" },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  return { app, window };
}
```

### 7.2 `launch.spec.ts`

| #   | Test Case                                                  |
| --- | ---------------------------------------------------------- |
| 1   | App launches and window is visible                         |
| 2   | Window title is correct                                    |
| 3   | All main panels render (toolbar, canvas, sidebar, console) |
| 4   | Default machine config loaded                              |
| 5   | App closes cleanly                                         |

### 7.3 `svg-import.spec.ts`

| #   | Test Case                                              |
| --- | ------------------------------------------------------ |
| 1   | Import SVG via toolbar → paths appear on canvas        |
| 2   | Properties panel shows imported SVG with correct name  |
| 3   | Drag import on canvas → position updates in properties |
| 4   | Scale handle resizes import                            |
| 5   | Delete import via keyboard                             |
| 6   | Multiple SVG imports displayed simultaneously          |

### 7.4 `gcode-generation.spec.ts`

| #   | Test Case                                                         |
| --- | ----------------------------------------------------------------- |
| 1   | Import SVG → Generate G-code → save dialog appears (disconnected) |
| 2   | Generated file contains correct header                            |
| 3   | G-code contains pen up/down commands from config                  |
| 4   | Progress toast appears during generation                          |
| 5   | Cancel generation → cancelled toast                               |
| 6   | Optimised generation produces reordered output                    |

### 7.5 `machine-config.spec.ts`

| #   | Test Case                                          |
| --- | -------------------------------------------------- |
| 1   | Open config dialog → configs listed                |
| 2   | Add new config → form appears                      |
| 3   | Edit config fields → changes persisted             |
| 4   | Delete config → removed from list                  |
| 5   | Duplicate config → new entry with "Copy of" prefix |
| 6   | Drag reorder configs                               |
| 7   | Export → file saved                                |
| 8   | Import → configs merged                            |

### 7.6 `file-browser.spec.ts` (requires mock FluidNC or skip)

These tests require either a running FluidNC device or an HTTP mock server.

| #   | Test Case                                        |
| --- | ------------------------------------------------ |
| 1   | Connect to machine → file list loads             |
| 2   | Upload file → appears in listing                 |
| 3   | Download file → save dialog + file written       |
| 4   | Delete file → removed from listing               |
| 5   | Select file as job → job controls show file name |
| 6   | Preview G-code file → toolpath rendered          |

---

## 8 Test Data Factories (`tests/helpers/factories.ts`)

```ts
import { v4 as uuid } from "uuid";
import type {
  MachineConfig,
  VectorObject,
  SvgImport,
  SvgPath,
  BackgroundTask,
  MachineStatus,
  GcodeOptions,
} from "../../src/types";

export function createMachineConfig(
  overrides?: Partial<MachineConfig>,
): MachineConfig {
  return {
    id: uuid(),
    name: "Test Machine",
    bedWidth: 220,
    bedHeight: 200,
    origin: "bottom-left",
    penType: "solenoid",
    penUpCommand: "M5",
    penDownCommand: "M3 S1000",
    feedrate: 3000,
    connection: { type: "wifi", host: "test.local", port: 80 },
    ...overrides,
  };
}

export function createVectorObject(
  overrides?: Partial<VectorObject>,
): VectorObject {
  return {
    id: uuid(),
    svgSource: "<path/>",
    path: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    originalWidth: 10,
    originalHeight: 10,
    ...overrides,
  };
}

export function createSvgPath(overrides?: Partial<SvgPath>): SvgPath {
  return {
    id: uuid(),
    d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
    svgSource: "<path/>",
    visible: true,
    ...overrides,
  };
}

export function createSvgImport(overrides?: Partial<SvgImport>): SvgImport {
  return {
    id: uuid(),
    name: "test-import",
    paths: [createSvgPath()],
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 100,
    svgHeight: 100,
    viewBoxX: 0,
    viewBoxY: 0,
    ...overrides,
  };
}

export function createBackgroundTask(
  overrides?: Partial<BackgroundTask>,
): BackgroundTask {
  return {
    id: uuid(),
    type: "gcode-generate",
    label: "Test task",
    progress: null,
    status: "running",
    ...overrides,
  };
}

export function createMachineStatus(
  overrides?: Partial<MachineStatus>,
): MachineStatus {
  return {
    raw: "<Idle|MPos:0.000,0.000,0.000|FS:0,0>",
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

export function createGcodeOptions(
  overrides?: Partial<GcodeOptions>,
): GcodeOptions {
  return {
    arcFitting: false,
    arcTolerance: 0.1,
    optimisePaths: false,
    ...overrides,
  };
}
```

---

## 9 Coverage Goals

| Area                                                         | Target             | Rationale                                                          |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------ |
| Pure functions (`gcodeParser`, `svgTransform`, worker logic) | **≥ 95%**          | Critical correctness — wrong G-code can damage hardware            |
| Zustand stores                                               | **≥ 90%**          | All state transitions tested                                       |
| `TaskManager`                                                | **≥ 90%**          | Lifecycle state machine                                            |
| `FluidNCClient` / `SerialClient`                             | **≥ 80%**          | Network I/O hard to fully exercise; mock-based                     |
| React components                                             | **≥ 70%**          | Interaction + rendering coverage; canvas SVG is hard to test fully |
| E2E                                                          | **Smoke coverage** | Confirm critical user flows work end-to-end                        |

---

## 10 Refactoring Prerequisites

Before writing tests, these small refactors will significantly improve testability:

### 10.1 Extract worker pure functions

Move `tokenizePath`, `toAbsolute`, `flattenToSubpaths`, `nearestNeighbourSort`, `transformPt`, `cubicBezier`, `quadBezier`, `arcToBeziers`, and `fmt` from `svgWorker.ts` into a new file:

```
src/workers/gcodeEngine.ts     ← exported pure functions
src/workers/svgWorker.ts       ← imports from gcodeEngine.ts, keeps only message handler
```

This allows direct import and testing without needing a Worker context.

### 10.2 Expose `parseListLines` on `SerialClient`

Currently `parseListLines` is private. Either:

- Make it a standalone exported function, or
- Test it indirectly through `listSDFiles()` / `listFiles()` with mocked `sendAndReceive`.

### 10.3 Expose `parseStatus` on `FluidNCClient`

Currently a private method. Extract to a standalone exported function (like `serial.ts` already does with `parseFluidNCStatus`).

---

## 11 CI Integration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm run test:coverage
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        if: matrix.os == 'ubuntu-latest' # E2E only on Linux (xvfb)
```

---

## 12 Priority Order for Implementation

| Phase       | Scope                                                                                    | Test Count (est.) | Effort    |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------- | --------- |
| **Phase 1** | Setup Vitest + pure function unit tests (`gcodeParser`, `svgTransform`, worker logic)    | ~70               | 1–2 days  |
| **Phase 2** | Store tests (`canvasStore`, `machineStore`, `taskStore`, `consoleStore`) + `TaskManager` | ~35               | 0.5–1 day |
| **Phase 3** | Machine client tests (`FluidNCClient`, `SerialClient`)                                   | ~45               | 1 day     |
| **Phase 4** | React component tests (RTL)                                                              | ~100              | 2–3 days  |
| **Phase 5** | E2E tests (Playwright + Electron)                                                        | ~25               | 1–2 days  |

**Total estimated tests: ~275**

---

## 13 Notes & Caveats

1. **`DOMMatrix` in tests** — `jsdom` does not implement `DOMMatrix`. Install `@simonwep/dom-matrix` or use a polyfill in `tests/setup.ts` for `svgTransform` tests.

2. **`DOMParser` / SVG in tests** — `jsdom` has limited SVG support. `getAccumulatedTransform` may need a `jsdom`-compatible polyfill for `SVGGraphicsElement.transform.baseVal`. Consider testing this function with real browser context in E2E instead, or using `linkedom`.

3. **Web Worker in Vitest** — Vitest supports `new Worker()` via `vitest/workers`. Alternatively, test the extracted pure functions directly (recommended).

4. **Serial port mocking** — `serialport` requires native bindings. Use `@serialport/binding-mock` for unit tests.

5. **Network mocking** — Use `msw` (Mock Service Worker) or Vitest's `vi.fn()` + `vi.spyOn(globalThis, 'fetch')` for FluidNC HTTP calls.

6. **Electron IPC in component tests** — All IPC calls go through `window.terraForge` which is mocked in `tests/setup.ts`. No real Electron context needed.

7. **TailwindCSS in tests** — RTL tests don't need CSS processing. The `jsdom` environment handles class names as plain attributes.
