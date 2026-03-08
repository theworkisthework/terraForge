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
- [x] Per-import width and height inputs (mm) — back-calculate scale from size; clamped to bed boundary from current origin
- [x] **Aspect ratio lock** — padlock icon between W and H fields; locked (default) keeps aspect ratio via shared `scale`; unlocked stores independent `scaleX`/`scaleY` per axis; drag-to-resize handles always restore uniform scale
- [x] **Scale shortcuts** — "Fit to bed" button (maximize icon) scales and repositions import to fill the bed; "1:1 reset" button (minimize icon) restores scale to 1 SVG unit = 1 mm; both sit below the Scale field matching the rotation shortcut style
- [x] Drag to move import on canvas — origin clamped so far edge cannot leave bed boundary
- [x] 8-handle bounding box for scaling (tl, t, tr, r, br, b, bl, l) with correct resize cursors — scale clamped so object cannot grow past bed boundary
- [x] Delete (×) button on selected import
- [x] Delete/Backspace key removes selected import
- [x] Escape key deselects

### Canvas Display

- [x] Bed grid based on machine config dimensions
- [x] 10 mm minor gridlines, 50 mm major gridlines
- [x] Origin marker (red dot at 0,0 in canvas coordinates, coloured red on ruler and bed)
- [x] Bed dimension label
- [x] `vectorEffect="non-scaling-stroke"` — stroke width stays consistent across scales
- [x] `non-scaling-stroke` on G-code toolpath overlay too
- [x] Zoom level percentage badge — bottom-left corner of canvas shows current zoom (e.g. `125%`)
- [x] Space-to-pan mode — hold Space to enter pan mode; cursor changes to grab/grabbing; subtle in-canvas hint shown; release Space to exit
- [x] Middle-mouse-button drag pans the canvas without entering Space mode
- [x] Canvas pan state is preserved across resizes; fit-to-view re-centres on resize only when fitted flag is active

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
- [x] **G-code generation options dialog** — clicking "Generate G-code" opens a modal with three independently-toggled options before generation begins: **Optimise paths** (nearest-neighbour reorder), **Upload to SD card** (direct upload to machine), and **Save to computer** (native save dialog); any combination is valid; both upload and save can be active simultaneously; at least one output must be selected (Generate button is disabled otherwise)
- [x] **Persisted generation preferences** — all three dialog options are stored in `localStorage` under `terraforge.gcodePrefs` and restored on the next session; defaults are Optimise=on, Upload to SD=on, Save to computer=off
- [x] **Direct SD upload on generation** — when "Upload to SD card" is selected and the machine is connected, the generated G-code is uploaded to the SD card root; the uploaded file is auto-selected as the queued job so "Start job" is immediately ready; when not connected the option is annotated "(not connected — will be skipped)" but remains selectable for pre-configuring preferences
- [x] `toVectorObjects()` flattens grouped import model for worker compatibility
- [x] **Path optimisation (nearest-neighbour)** — "Optimise paths" checkbox in the generation options dialog; worker collects all subpaths from every visible object into a single pool, reorders them greedily from the current pen position to minimise total rapid travel distance; emitted as a flat optimised sequence (no per-object grouping); optimisation flag reported in G-code header
- [x] **Smart save filename** — default filename is derived from the import name(s) from the Properties panel; single import uses its name directly; multiple imports appends `+N` (e.g. `logo+1.gcode`); optimised jobs append `_opt` (e.g. `logo_opt.gcode`, `logo+1_opt.gcode`)

### G-code Preview

- [x] Fetch and parse `.gcode`/`.nc` files from the file browser
- [x] Toolpath overlay on canvas — rapids in grey dashed, cuts in blue
- [x] Bounding box highlight when toolpath selected
- [x] Delete toolpath with Delete key or × button
- [x] Correct Y-axis flip (machine origin at bottom-left)

### G-code Import

- [x] Fetch and parse `.gcode`/`.nc` files from the host file system and display as per previewing gcode files from SD — "Import G-code" button in the toolbar opens a filtered file dialog (all recognised G-code extensions); file is read from the host filesystem, parsed with `parseGcode`, and displayed as a toolpath overlay on the canvas exactly as SD-sourced previews are
- [x] Allow plotting of imported gcode from memory or temp file (i.e. imported and not on SD card) — "Start job" detects `source: "local"` and automatically uploads the local file to the SD card root before issuing the FluidNC run command; the Job panel labels the file with 🖥 and "(local — will upload)" so the user knows the upload step will occur

### Machine Connection

- [x] Wi-Fi (WebSocket) connection to FluidNC `/ws`
- [x] USB serial connection
- [x] Connect / Disconnect button
- [x] Connection status indicator (green dot + "Connected" label)
- [x] WebSocket ping watchdog — marks connection dead after 15 s of no ping
- [x] Real-time machine status pushed from main process to renderer via IPC
- [x] Real-time position display in status bar (X / Y / Z)
- [x] Machine state display (Idle, Run, Hold, Alarm, etc.)
- [x] Show connected firmware version near online status (detected via [ESP800] probe; displayed as e.g. "FluidNC v4.0.1" to the left of the connection dot)

### Machine Configuration

- [x] Multiple machine config profiles (add, edit, delete)
- [x] Machine selector dropdown in toolbar
- [x] Config fields: name, bed width/height, origin, pen type, pen up/down commands, feedrate, connection (Wi-Fi host/port or serial path)
- [x] Configs persisted to disk via IPC
- [x] Duplicate existing config — "Copy" button in sidebar creates a deep clone of the selected config with name prefixed "Copy of …", assigns a new UUID, persists it, and selects it for editing
- [x] Reorder configs in config list — drag-and-drop via `@dnd-kit/sortable`; each sidebar row has a grab handle on the left; new order is persisted atomically via `fs.saveConfigs`
- [x] Should not be able to change machine config while connected — active config form is read-only (fieldset disabled + amber banner) when connected; machine selector dropdown in toolbar is disabled; "Set as Active" and "Del" buttons are blocked; non-active configs remain editable
- [x] Changing pen type should change commands — selecting a pen type auto-populates defaults (solenoid: `M3S0`/`M3S1`; servo & stepper: `G0Z15`/`G0Z0`); prompts before overwriting custom values; ⇕ Swap button reverses up/down (handles reversed solenoid wiring); ↺ Reset button restores type defaults; commands remain free-text editable; contextual hint shown per type
- [x] Five origin modes — bottom-left, top-left, bottom-right, top-right, **center**; all five are supported in the canvas coordinate system, G-code toolpath overlay, ruler, and origin marker; center origin places (0,0) at the centre of the bed with ± coordinates on both axes
- [x] WebSocket port override (`wsPort`) — optional per-config field in the Machine Config dialog; auto-detects from `[ESP800]` firmware version query at connect time; FluidNC 4.x shares the HTTP port (leave blank); older ESP3D-based firmware uses port 81; explicit value overrides auto-detect
- [x] Export / Import machine configs — "↑ Export" saves all configs to a user-chosen `.json` file; "↓ Import" reads a JSON file and merges configs, skipping duplicates by ID or name; import result reports added/skipped counts

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
- [ ] Internal file browser condensed by default
- [ ] Don't try to fetch file contents until we have a sucessful connection to avoid unfriendly errors

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
- [x] **Run Homing button in Jog panel** — sends `$H` to trigger the FluidNC homing cycle
- [x] **Set Zero button in Jog panel** — sends `G10 L20 P1 X0 Y0 Z0` to declare current position as work-coordinate zero
- [x] Jog panel shown/hidden via toolbar toggle
- [x] Homing cycle button (`$H`) in main toolbar — disabled when not connected
- [x] Floating draggable jog panel — jog panel opens as a fixed-position overlay; drag handle at the top allows repositioning anywhere on screen; last position preserved within the session
- [ ] Pen specific job controls (up/down if solenoid, slider + buttons if servo or stepper)

### Console

- [x] Real-time console output from FluidNC (WebSocket stream)
- [x] Scrollable, monospaced log panel
- [x] Clear button
- [x] Command input (send raw G-code commands)
- [x] Alarm state badge becomes a clickable button — sends `$X` to clear the alarm
- [x] Firmware restart button — "⚠ Restart FW" button visible in console header when connected; sends `[ESP444]RESTART` to reboot the ESP32; automatically disconnects the app and shows a reconnect prompt; confirms with the user before firing

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

### Properties Panel

- [x] Import name editing — double-click the import name in the Properties panel to rename it inline; confirms on Enter or blur; cancels on Escape; name feeds the G-code save dialog default filename
- [x] Per-import visibility toggle — eye icon on each import row toggles visibility on canvas and excludes it from G-code generation
- [x] Expandable path list — each import row has a ▸/▾ toggle to show/hide the individual paths it contains, with layer/group names or short IDs
- [x] Per-path visibility toggle — each path within an import can be shown/hidden independently; hidden paths are excluded from G-code output
- [x] Remove individual paths — ✕ button per path deletes it from the import without removing the whole import

### Architecture

- [x] Electron + React 19 + TypeScript throughout
- [x] Node integration disabled in renderer — all IPC via `contextBridge`
- [x] Fully typed `window.terraForge` API (`fluidnc`, `serial`, `fs`, `tasks`, `jobs`, `config`)
- [x] Zustand stores: `canvasStore`, `machineStore`, `taskStore`, `consoleStore`
- [x] SVG → G-code engine in Web Worker (`svgWorker.ts`)
- [x] TailwindCSS styling, Vite 7 + electron-vite 5 build

---

## Not Yet Implemented

- [ ] **Pen pressure** Encode pen height into source drawing (3d model with z height). how do we do this?

### Canvas

- [x] **Rotation** — rotation handle (filled circle above the top-centre edge of the selection box) supports drag-to-rotate; bounding box and all 8 scale handles track the rotated position; rotation numeric input in the Properties panel; rotation is applied in G-code output via `transformPt` in `gcodeEngine.ts`
- [x] **Canvas zoom / pan** — scroll-to-zoom (mouse wheel), Space+drag pan, middle-mouse-button drag pan, +/− overlay buttons, keyboard shortcuts (Ctrl+Shift++/−)
- [ ] **Snap to grid** — no grid snapping when dragging
- [ ] **Undo / redo** — no history stack
- [x] **Canvas ruler / dimension overlay** — screen-space X/Y rulers with adaptive tick density, mm labels, and origin highlighted in red
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

- [ ] **Keyboard shortcut map** — no help panel, but the following shortcuts ARE implemented: Space+drag=pan, middle-mouse=pan, Ctrl+0=fit-to-view, Ctrl+Shift++/−=zoom, Delete/Backspace=remove selection, Escape=deselect
- [ ] **First-run onboarding wizard** — no guidance for new users to set up a machine config
- [ ] **Recent files list**
- [x] **Notifications for completed/cancelled/failed tasks** — toast stack with auto-dismiss for completed/cancelled (8 s) and persistent display for errors
- [x] **Error detail in task toasts** — errored tasks show the error string as a second line below the label
- [ ] **Dark / light theme toggle**
- [x] **Zoom-to-fit** button (⊡) in canvas overlay centres and scales the bed to fill the viewport; Ctrl+0 keyboard shortcut; button highlights red when actively fitted; re-fits automatically on window resize
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
