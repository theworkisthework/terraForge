# terraForge — Feature Status

## Implemented

### SVG Import & Canvas

- [x] Import SVG files via native open dialog (filtered to `.svg`)
- [x] Parse all SVG shape types → path `d` strings: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`
- [x] Rounded-rect support (`rx`/`ry` attributes)
- [x] Physical size detection from SVG `width`/`height` attributes — handles `mm`, `cm`, `in`, `pt`, `pc`, `px`/unitless (96 DPI), so imported SVGs appear at their correct real-world scale by default
- [x] ViewBox offset support — SVGs with non-zero viewBox origins render correctly
- [x] Grouped import model: one `SvgImport` per file containing `SvgPath[]`, paths preserve relative positions
- [x] Per-import x/y position on bed (mm) — clamped so the object's far edge stays within bed bounds
- [x] Per-import uniform scale
- [x] Per-import width and height inputs (mm) — back-calculate scale from size; aspect ratio always preserved; clamped to bed boundary from current origin
- [x] Drag to move import on canvas — origin clamped so far edge cannot leave bed boundary
- [x] 8-handle bounding box for scaling (tl, t, tr, r, br, b, bl, l) with correct resize cursors — scale clamped so object cannot grow past bed boundary
- [x] Delete (×) button on selected import
- [x] Delete/Backspace key removes selected import
- [x] Escape key deselects

### Canvas Display

- [x] Bed grid based on machine config dimensions
- [x] 10 mm minor gridlines, 50 mm major gridlines
- [x] Origin marker (red dot at 0,0)
- [x] Bed dimension label
- [x] `vectorEffect="non-scaling-stroke"` — stroke width stays consistent across scales
- [x] `non-scaling-stroke` on G-code toolpath overlay too

### G-code Generation

- [x] Runs in a Web Worker (renderer never blocks)
- [x] Full SVG path command support: M, L, H, V, C, S, Q, T, A, Z (absolute and relative variants)
- [x] Cubic and quadratic Bézier flattening to polylines
- [x] Elliptical arc flattening
- [x] Applies import position and scale to output coordinates
- [x] G90 absolute mode, G21 mm units
- [x] G0 rapid travel (pen up), G1 linear draw (pen down)
- [x] Per-object progress reporting → task bar progress
- [x] Cancellation support (cancel message to worker)
- [x] G-code header with machine name, bed size, origin, optimisation flag, timestamp
- [x] Save G-code via native save dialog
- [x] `toVectorObjects()` flattens grouped import model for worker compatibility
- [x] **Path optimisation (nearest-neighbour)** — split button on "Generate G-code" reveals "Generate & optimise" option; worker collects all subpaths from every visible object into a single pool, reorders them greedily from the current pen position to minimise total rapid travel distance; emitted as a flat optimised sequence (no per-object grouping); optimisation flag reported in G-code header
- [x] **Smart save filename** — default filename in the save dialog is derived from the import name(s) from the Properties panel; single import uses its name directly; multiple imports appends `+N` (e.g. `logo+1.gcode`); optimised jobs append `_opt` (e.g. `logo_opt.gcode`, `logo+1_opt.gcode`)

### G-code Preview

- [x] Fetch and parse `.gcode`/`.nc` files from the file browser
- [x] Toolpath overlay on canvas — rapids in grey dashed, cuts in blue
- [x] Bounding box highlight when toolpath selected
- [x] Delete toolpath with Delete key or × button
- [x] Correct Y-axis flip (machine origin at bottom-left)

### G-code Import

- [ ] Fetch and parse `.gcode`/`.nc` files from the host file system and display as per previewing gcode files from SD
- [ ] Allow plotting of imported gcode from memory or temp file (i.e. imported and not on SD card)

### Machine Connection

- [x] Wi-Fi (WebSocket) connection to FluidNC `/ws`
- [x] USB serial connection
- [x] Connect / Disconnect button
- [x] Connection status indicator (green dot + "Connected" label)
- [x] WebSocket ping watchdog — marks connection dead after 15 s of no ping
- [x] Real-time machine status pushed from main process to renderer via IPC
- [x] Real-time position display in status bar (X / Y / Z)
- [x] Machine state display (Idle, Run, Hold, Alarm, etc.)

### Machine Configuration

- [x] Multiple machine config profiles (add, edit, delete)
- [x] Machine selector dropdown in toolbar
- [x] Config fields: name, bed width/height, origin, pen type, pen up/down commands, feedrate, connection (Wi-Fi host/port or serial path)
- [x] Configs persisted to disk via IPC
- [x] Duplicate existing config — "Copy" button in sidebar creates a deep clone of the selected config with name prefixed "Copy of …", assigns a new UUID, persists it, and selects it for editing
- [x] Reorder configs in config list — drag-and-drop via `@dnd-kit/sortable`; each sidebar row has a grab handle on the left; new order is persisted atomically via `fs.saveConfigs`
- [x] Should not be able to change machine config while connected — active config form is read-only (fieldset disabled + amber banner) when connected; machine selector dropdown in toolbar is disabled; "Set as Active" and "Del" buttons are blocked; non-active configs remain editable
- [x] Changing pen type should change commands — selecting a pen type auto-populates defaults (solenoid: `M3S0`/`M3S1`; servo & stepper: `G0Z15`/`G0Z0`); prompts before overwriting custom values; ⇕ Swap button reverses up/down (handles reversed solenoid wiring); ↺ Reset button restores type defaults; commands remain free-text editable; contextual hint shown per type

### File Browser

- [x] Internal FluidNC filesystem browser (`/files` endpoint)
- [x] SD card filesystem browser (`/sd` endpoint)
- [x] Directory navigation (click folders to enter, `/ ` to go up)
- [x] File listing with size display
- [x] Upload any file type (unrestricted native dialog)
- [x] Download file (save to local disk) — G-code files use a `.gcode`/`.nc`/`.cnc`-filtered save dialog; all other file types use an unfiltered save dialog
- [x] Delete file
- [x] Run file on machine immediately via ▶ button per file row
- [x] Click file row to select it as the queued job file (highlighted in blue); clicking again deselects
- [x] G-code preview button on `.gcode`/`.nc` files — loads toolpath overlay on canvas
- [x] Upload/download progress tracked in task bar
- [x] Auto-refresh listing after upload

### Job Control

- [x] Start job button — disabled until a valid G-code file is selected in the file browser
- [x] Selected job file shown in Job panel with name; warns if selected file is not a recognised G-code extension
- [x] Supported G-code extensions: `.gcode`, `.nc`, `.g`, `.gc`, `.gco`, `.ngc`, `.ncc`, `.cnc`, `.tap`
- [x] Pause job
- [x] Resume job
- [x] Abort job
- [x] Job progress bar (line number / total lines, from FluidNC status)
- [x] Indeterminate progress animation when line total unavailable
- [x] Running / Paused state labels

### Jog Controls

- [x] X+, X-, Y+, Y- jog buttons
- [x] Z+, Z- jog buttons
- [x] Step size selector: 0.1 / 1 / 10 / 100 mm
- [x] Configurable feedrate input
- [x] Go-to-origin button (G0 X0 Y0)
- [x] Jog panel shown/hidden via toolbar toggle
- [x] Homing cycle button (`$H`) in main toolbar — disabled when not connected

### Console

- [x] Real-time console output from FluidNC (WebSocket stream)
- [x] Scrollable, monospaced log panel
- [x] Clear button
- [x] Command input (send raw G-code commands)
- [x] Alarm state badge becomes a clickable button — sends `$X` to clear the alarm

### Background Task UX

- [x] Toast stack overlay — tasks appear as a floating stack in the top-right corner of the main canvas panel (not in the document flow; nothing is pushed or reflowed)
- [x] Fixed 280 px width on all toasts — consistent size regardless of label length
- [x] Determinate progress bar when progress % is known
- [x] Indeterminate spinner when progress is unknown
- [x] Per-task label
- [x] Tooltip on task label shows full text when truncated by overflow
- [x] Status icons: ✓ green for completed, ✕ red for cancelled, ! red for errors
- [x] Completed and cancelled toasts auto-dismiss after 8 s; errors never auto-dismiss (must be manually dismissed)
- [x] Error toasts surface the error message as a second line below the label
- [x] Cancel button on each running task — calls renderer-side cancel callback directly (no IPC round-trip) for tasks whose work runs in the renderer
- [x] G-code generation cancellation: cancel button posts a `cancel` message directly to the Web Worker via a callback registered in `taskStore`; worker emits a distinct `cancelled` message type (not re-used as `error`)
- [x] Cancel callbacks stored in a plain module-level `Map` outside of immer state to avoid immer's freeze/proxy cycle breaking function values
- [x] IPC fallback for main-process tasks (file upload/download) that have no renderer-side callback
- [x] Task types: `svg-parse`, `gcode-generate`, `file-upload`, `file-download`, `file-delete`, `job-start`, `ws-connect`

### Architecture

- [x] Electron + React 19 + TypeScript throughout
- [x] Node integration disabled in renderer — all IPC via `contextBridge`
- [x] Fully typed `window.terraForge` API (`fluidnc`, `serial`, `fs`, `tasks`, `jobs`, `config`)
- [x] Zustand stores: `canvasStore`, `machineStore`, `taskStore`, `consoleStore`
- [x] SVG → G-code engine in Web Worker (`svgWorker.ts`)
- [x] TailwindCSS styling, Vite 7 + electron-vite 5 build

---

## Not Yet Implemented

### Canvas

- [ ] **Rotation** — spec calls for rotation handle/input; `rotation` field exists in the data model but is not applied on canvas or in G-code output
- [x] **Canvas zoom / pan** — bed is fixed-scale; no scroll-to-zoom or middle-mouse pan
- [ ] **Snap to grid** — no grid snapping when dragging
- [ ] **Undo / redo** — no history stack
- [x] **Canvas ruler / dimension overlay**
- [ ] **Multi-select** — can only select one import at a time

### SVG Import

- [x] **SVG `transform` attribute resolution** — `transform` attributes on `<path>`, `<g>`, and all ancestor elements are resolved and baked into the path `d` coordinates at import time; handles `translate`, `scale`, `rotate`, `matrix`, and arbitrary compositions including Inkscape layer matrices
- [ ] **Import multiple SVGs at once** — dialog is single-select
- [ ] **Layer / group visibility control before import** — no pre-import layer preview
- [ ] **DXF import** — only SVG supported
- [ ] **Paste SVG from clipboard**

### G-code Generation

- [ ] **Arc fitting (G2/G3)** — not yet implemented (`arcFitting` option exists in `GcodeOptions` and is forwarded to the worker; worker always uses linear segments)
- [x] **origin mode** — `origin: "top-left"` G-code should observe origin setting
- [ ] **Per-import feedrate override**
- [ ] **Toolpath simulation** — animate pen movement before sending, estimate job duration

### Machine Control

- [ ] **Auto-reconnect on WebSocket drop** — watchdog detects the loss, but reconnection must be manual
- [ ] **Serial streaming** — streaming G-code line-by-line over USB serial is not implemented; current serial API only sends individual commands
- [ ] **Bluetooth connection** — FluidNC supports Bluetooth; `MachineConfig.connection` type could be extended to `"wifi" | "usb" | "bluetooth"`
- [x] **Homing sequence button** (`$H`) — in main toolbar, disabled when not connected
- [ ] **Probe / touch-off**
- [x] **Alarm clear** (`$X`) — clicking the pulsing ALARM badge in the console header sends `$X`

### Job Control

- [ ] **Direct streaming to machine** — current flow requires upload to SD first; streaming G-code directly from the app without an SD card is not supported
- [ ] **Job queue** — only one job at a time, no queue management
- [ ] **Saved job history**

### File Browser

- [x] **Download save dialog** — G-code files use a filtered dialog; non-G-code files use an unfiltered dialog
- [ ] **Rename file on machine**
- [ ] **Create directory**

### UX / Polish

- [ ] **Keyboard shortcut map** — no documented or configurable shortcuts beyond Delete/Escape
- [ ] **First-run onboarding wizard** — no guidance for new users to set up a machine config
- [ ] **Recent files list**
- [x] **Notifications for completed/cancelled/failed tasks** — toast stack with auto-dismiss for completed/cancelled (8 s) and persistent display for errors
- [x] **Error detail in task toasts** — errored tasks show the error string as a second line below the label
- [ ] **Dark / light theme toggle**
- [ ] **Zoom-to-fit** button to centre the bed in the canvas viewport
- [ ] **Print / export canvas as image**

### Distribution / Build

- [ ] **Code signing (Authenticode)** — currently unsigned; causes AV false positives on the NSIS installer (SpiderBanner.dll flagged 1/72 on VirusTotal). Fix: obtain an Authenticode cert and sign the installer + app binary in CI
- [ ] **Portable / zip target** — switching `win.target` from `nsis` to `["portable","zip"]` eliminates the NSIS plugin bundle entirely and avoids the SpiderBanner false positive; portable EXE is arguably better UX for a developer tool

### Nice-to-Have (Not in Spec)

- [ ] **Path reorder in properties panel** (drag-to-reorder paths within an import)
- [ ] **Air/vacuum pen control** (non-solenoid accessories)
- [ ] **Jog with keyboard arrow keys**
- [ ] **Gamepad / joystick input for jog**
- [ ] **Machine status history chart** (position over time)
- [ ] **FluidNC config file editor** (edit `config.yaml` in-app)
- [ ] **Estimated job time** (total path length ÷ feedrate)
- [ ] **Crash / alarm detection with auto-pause**
- [ ] **Tool/pen preset library**
- [ ] **SVG optimisation before import** (remove duplicate nodes, merge short segments)
- [ ] **Multi-file G-code** (concatenate multiple imports into a single job file)
