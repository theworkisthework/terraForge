terraForge — Master Project Specification (Updated 2026-03-29)
You are the primary software engineer for terraForge, a cross‑platform Electron + React application that serves as a full UI, job manager, and SVG→G‑code engine for the TerraPen pen plotter (FluidNC‑based). You must design and implement the entire application in a consistent, modular, production‑ready way.

Your outputs must always follow the architecture, constraints, and definitions below. Do not invent APIs, libraries, or patterns not explicitly allowed here.

1. Project Identity and Purpose
   terraForge is a desktop application that provides:

SVG and PDF import, parsing, and manipulation

SVG → G‑code conversion (linear + optional arc fitting)

G‑code preview and import from local disk

FluidNC machine control over Wi‑Fi and USB

Internal flash and SD card file management

Job upload, start, pause, resume, abort

Console output and status monitoring

Jog controls for X/Y/Z

Machine configuration selection with multiple profiles

Clear UI feedback for all background tasks, with cancellation support

Layer groups for multi-pen plotting

Undo/redo, copy/paste, and canvas editing

Dark and light theme support

Page template overlays for print-size artwork

Layout save/open/close

The target hardware is the TerraPen, but the app must support multiple FluidNC‑based machines via configuration profiles.

2. Technology Stack (Fixed and Mandatory)
   Electron
   Electron 40+

Node integration disabled in renderer

IPC via contextBridge with a typed preload API

Main process handles:

Serial communication

HTTP requests to FluidNC

WebSocket connections

File system access

Background task orchestration

React
React 19 functional components only
TypeScript everywhere

State management: Zustand

Styling: TailwindCSS

Bundler: Vite 7

No class components, no Redux, no CSS‑in‑JS

Workers / WASM
The SVG → G‑code engine must run in a Web Worker or WASM module

The renderer must never block on heavy computation

All long‑running tasks must support:

progress reporting (if possible)

cancellation

UI feedback (spinner or progress bar)

3. Application Architecture
   Folder Structure
   Code
   /app
   /main (Electron main process)
   /preload (contextBridge API)
   /renderer (React UI)
   /workers (SVG/G-code engine)
   /machine (FluidNC API client)
   /types (shared TypeScript interfaces)
   /tasks (background task orchestration)
   IPC Contract
   The preload script exposes a single API namespace:

Code
window.terraForge = {
fluidnc: {
getStatus, sendCommand,
listFiles, listSDFiles, uploadFile, uploadGcode, downloadFile, fetchFileText, deleteFile,
runFile, pauseJob, resumeJob, abortJob,
connectWebSocket, disconnectWebSocket,
onStatusUpdate, onConsoleMessage, onPing, onFirmwareInfo
},
serial: { listPorts, connect, disconnect, send, onData },
fs: {
openSvgDialog, openPdfDialog, openFileDialog, openGcodeDialog, openImportDialog,
readFile, readFileBinary, writeFile,
saveGcodeDialog, saveFileDialog, saveLayoutDialog, openLayoutDialog,
chooseDirectory,
onMenuImport, onMenuOpenLayout, onMenuSaveLayout, onMenuCloseLayout,
setLayoutMenuState,
loadConfigs, saveConfigs
},
jobs: { generateGcode },
config: {
getMachineConfigs, saveMachineConfig, deleteMachineConfig,
exportConfigs, importConfigs,
loadPageSizes, openPageSizesFile
},
tasks: { cancel, onTaskUpdate },
app: { getVersion, openExternal, onMenuAbout },
edit: { onMenuCopy, onMenuCut, onMenuPaste, onMenuSelectAll, setHasSelection }
}
All methods must be explicitly typed.

4. Data Models (Mandatory)
   MachineConfig
   Code
   {
   id: string
   name: string
   bedWidth: number // mm
   bedHeight: number // mm
   origin: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center"
   penType: "solenoid" | "servo" | "stepper"
   penUpCommand: string
   penDownCommand: string
   feedrate: number // mm/min
   connection: {
   type: "wifi" | "usb"
   host?: string
   port?: number
   wsPort?: number // optional WS port override; auto-detected from [ESP800] if omitted
   serialPath?: string
   }
   }
   SvgPath (sub-object within SvgImport — one per SVG path element)
   Code
   {
   id: string
   d: string // path d-string in SVG user-unit coordinate space (absolute)
   svgSource: string // original element outerHTML
   visible: boolean
   label?: string // human-readable display name
   layer?: string // id of the containing SvgLayer within the parent SvgImport.layers; undefined for paths not inside a detected layer group
   hasFill?: boolean // true if the original shape had a visible fill
   outlineVisible?: boolean // false to suppress stroke without hiding hatch
   hatchLines?: string[] // synthesised hatch-fill line d-strings
   }
   SvgLayer (logical sub-layer within an SvgImport — e.g. an Inkscape layer group)
   Code
   {
   id: string // matches the HTML id of the source <g> element
   name: string // human-readable label (inkscape:label, id, class, or positional fallback)
   visible: boolean // initial value mirrors the SVG source (display:none → false); toggled in UI
   }
   SvgImport (primary canvas model — replaces VectorObject as the canvas unit)
   Code
   {
   id: string
   name: string // display name, defaults to filename without extension
   paths: SvgPath[] // all paths extracted from the import
   x: number // bed position of SVG bottom-left corner (mm)
   y: number
   scale: number // uniform scale (SVG user units → mm)
   scaleX?: number // per-axis scale when ratio lock is OFF
   scaleY?: number
   rotation: number // degrees
   visible: boolean
   svgWidth: number // SVG viewBox dimensions in user units
   svgHeight: number
   viewBoxX: number // viewBox origin (for non-zero viewBox offsets)
   viewBoxY: number
   hatchEnabled?: boolean
   hatchSpacingMM?: number
   hatchAngleDeg?: number
   strokeWidthMM?: number // preview stroke width (does not affect G-code)
   layers?: SvgLayer[] // logical sub-layers detected from the source SVG; absent when none found
   }
   VectorObject (flattened representation passed to the G-code worker)
   Code
   {
   id: string
   svgSource: string
   path: string // absolute SVG path d string
   x: number
   y: number
   scale: number
   scaleX?: number
   scaleY?: number
   rotation: number
   visible: boolean
   originalWidth: number // SVG viewBox width in user units
   originalHeight: number
   layer?: string
   }
   LayerGroup
   Code
   {
   id: string
   name: string // user-visible name; also used as G-code filename base
   color: string // CSS hex colour, e.g. "#e94560"
   importIds: string[] // SvgImport.id values belonging to this group
   }
   PageSize / PageTemplate
   Code
   // PageSize — named paper/page dimension pair in portrait orientation
   { id: string; name: string; widthMM: number; heightMM: number }
   // PageTemplate — the active overlay shown on the canvas
   { sizeId: string; landscape: boolean; marginMM: number }
   CanvasLayout (saved/loaded as .tforge JSON)
   Code
   {
   tfVersion: number
   savedAt: string
   imports: SvgImport[]
   layerGroups?: LayerGroup[]
   pageTemplate?: PageTemplate | null
   }
   Job
   Code
   {
   id: string
   name: string
   gcode: string
   machineId: string
   createdAt: number
   }
   GcodeOptions
   Code
   {
   arcFitting: boolean // scaffold only — worker always uses linear segments
   arcTolerance: number // mm
   optimisePaths: boolean // nearest-neighbour reorder
   joinPaths: boolean // experimental: merge endpoints within joinTolerance
   joinTolerance: number // mm gap threshold (default 0.2)
   liftPenAtEnd: boolean // send penUpCommand after the last stroke
   returnToHome: boolean // send G0 X0 Y0 at end of job
   customStartGcode: string // inserted after preamble, before paths
   customEndGcode: string // appended after lift/return
   pageClip?: { // when a page template is active — clips output to printable area
   widthMM: number
   heightMM: number
   marginMM: number
   }
   }
   BackgroundTask
   Code
   {
   id: string
   type: "svg-parse" | "gcode-generate" | "gcode-preview" | "file-upload" | "file-download" | "file-delete" | "job-start" | "ws-connect"
   label: string // human-readable description shown in the toast
   progress: number | null // 0–100 or null for indeterminate
   status: "running" | "completed" | "cancelled" | "error"
   error?: string
   }
5. SVG Handling Rules
   Library Choice
   Use the most active and well‑maintained SVG parsing library available.
   If a less popular library provides significantly simpler or more robust path flattening, transformation, or arc fitting, it may be used instead.

Parsing Requirements
Import SVG files

Convert all paths to absolute coordinates

Apply transforms (translate, scale, rotate) before G‑code generation

Preserve groups/layers as separate VectorObjects

Ignore stroke width

Flatten curves to line segments unless arc fitting is enabled

Canvas coordinate system must match machine config origin

Parsing must run in a background worker and support cancellation

6. G‑code Generation Rules
   General
   Units: mm

Coordinates: absolute

Movement: G0 (rapid) and G1 (linear)

Optional: G2/G3 arcs when arc fitting is enabled

Pen up/down: use machine config commands

Feedrate: from machine config

No relative moves

Output must reflect the object’s position, scale, and rotation on the canvas

Output must include:

Header with metadata

Pen up before travel

Pen down for drawing

Pen up at end

G-code Options Dialog
Clicking "Generate G-code" opens a modal dialog with independently-toggled options before generation begins:

Optimise paths — nearest-neighbour reorder to minimise rapid travel
Join nearby paths — (experimental) merge path endpoints within configurable tolerance (default 0.2 mm)
Upload to SD card — direct upload to machine after generation
Save to computer — native save dialog
At least one output must be selected; a pre-generation validation enforces this.
All four settings plus the join tolerance are persisted in localStorage under `terraforge.gcodePrefs`.

Path Optimisation (nearest-neighbour)
When "Optimise paths" is enabled:

Worker collects all subpaths from all visible objects into a single pool

Subpaths are reordered greedily from current pen position to minimise total rapid travel (O(n√n) spatial-grid approach)

Output is a flat optimised sequence (no per-object grouping)

Optimisation flag is recorded in the G-code header comment

The save-dialog default filename appends `_opt` when optimisation is active

Bed Clipping
The Liang-Barsky line clipper (`clipSubpathsToRect`) removes any path segments that fall outside the machine bed (or page-clip area when a page template is active).

Custom G-code Hooks
`GcodeOptions.customStartGcode` is inserted after the preamble and before the first path.
`GcodeOptions.customEndGcode` is appended after the final pen-lift and return-home moves.

Save Filename
The default filename in the native save dialog is derived from the import name(s):

Single import: `<name>.gcode`

Multiple imports: `<first-name>+<N>.gcode` (e.g. `logo+1.gcode`)

Optimised jobs append `_opt` before the extension

Illegal filesystem characters in the name are replaced with `_`

Arc Support
When arc fitting is enabled:

Fit arcs (G2/G3) where possible

Use FluidNC‑supported arc syntax

Ensure arcs respect machine coordinate system

Fallback to linear segments when arc fitting fails

(Arc fitting is scaffolded — `arcFitting` option exists in `GcodeOptions` and is forwarded to the worker — but the worker currently always uses linear segments.)

Background Task Requirements
G‑code generation must run in a worker

Must report progress (e.g., per path or per segment)

Must support cancellation

UI must show:

progress bar if progress is known

spinner if not

7. FluidNC Integration (Strict)
   Use only the official API documented at:
   http://wiki.fluidnc.com/en/support/interface/http-rest-api

REST Endpoints
Use the endpoints exactly as defined:

/command

/state

/files

/upload

/delete

/run

/pause

/resume

/abort

WebSocket
Connect to /ws

Receive console output and status updates

Auto-reconnect with exponential backoff (3 s → 60 s, doubles on failure, caps at 60 s)

Each reconnect attempt uses a unique generation counter to invalidate stale event handlers

HTTP 503 responses accelerate the backoff

WebSocket port re-probed via `[ESP800]` on each reconnect attempt

Intentional disconnect sends a clean WebSocket close code 1000 so the ESP32 WebSocket slot is freed immediately

Serial
USB serial must support:

sending commands

reading responses

streaming G‑code

Background Task Requirements
File uploads/downloads must be cancellable

UI must show progress when available (upload size, download size)

8. UI Requirements
   Canvas
   Shows bed grid based on machine config (10 mm minor / 50 mm major gridlines)

X/Y ruler overlays with adaptive tick density; origin highlighted in red

Zoom level badge; fit-to-view button and Ctrl+0 shortcut

Scroll-wheel zoom (centred at cursor); Space+drag pan; middle-mouse-button drag pan

Shows imported vectors with configurable stroke width per import

Supports:

drag to move (clamped to bed boundary)

8-handle bounding box for scaling; aspect ratio lock / unlock per axis

rotation handle (drag-to-rotate) and numeric angle input with preset shortcuts

numeric X/Y position, W/H dimension inputs

fit-to-bed and 1:1 scale shortcuts

Escape to deselect; Delete/Backspace to remove selection

Ctrl+A to select all (cycles: all -> first single -> all; group transforms applied)

Ctrl+Z / Ctrl+Shift+Z for 50-step undo/redo

Ctrl+C / Ctrl+X / Ctrl+V for in-memory copy/cut/paste (positionally-offset clone, auto-numbered names)

Pen position crosshair -- WCO-corrected, constant screen size, rendered in green

Live plot-progress overlay -- completed cut segments in red, rapids in orange

Page template overlay (non-interactive; renders below imports)

Panels
Left: dual-pane filesystem browser (internal flash + SD card, independently collapsible)

Center: canvas with floating toast stack (top-right) and floating draggable jog panel

Right: properties panel

Bottom: console + job progress

Properties Panel
Import name (inline rename on double-click)

X/Y position, W/H dimensions, scale, rotation (with +-5/+-15/+-45 degree presets and snap to 45 degree increments)

Alignment controls: left/center/right and top/center/bottom align buttons target machine bed by default; when a page template is active, an "Align to template" checkbox with Page/Margin selector switches alignment bounds to the selected page template rectangle or its margin inset rectangle

Aspect ratio lock (padlock), fit-to-bed, 1:1 reset shortcuts

Per-import visibility toggle; expandable path list; per-path visibility and delete

Hatch fill -- enable/disable, spacing (mm), angle (degrees); auto-regenerates on scale change

Stroke width -- configurable mm value; synced across layer group members

Centre marker toggle

G-code toolpath properties -- filename, size, line count, feedrate, estimated job duration

Layer group management -- add, rename, delete, colour picker, drag to assign imports, collapse/expand

Jog Controls
Floating draggable panel (fixed-position overlay); drag handle at top; position preserved within the session

XY direction pad (3x3 grid of direction buttons)

Step size selector: 0.1 / 1 / 10 / 100 mm

Configurable feedrate input

Go-to-origin button (G0 X0 Y0)

Z jog -- solenoid pen type sends configured penUpCommand/penDownCommand; servo/stepper uses incremental $J=G91 G21 Z+-dist F{feedrate} jog

Homing button ($H), Set Zero button (G10 L20 P1 X0 Y0 Z0)

Job Control
Upload G-code to SD (or run local file -- auto-uploads on job start if source is "local")

Start job (disabled until valid G-code file selected; file validated by extension)

Pause/Resume/Abort

Job progress bar (line number / total lines from Ln: status field)

Indeterminate progress animation when no line count available

Background Task UX
All long-running operations must:

show a progress bar when progress is measurable

show a spinner when progress is unknown

expose a "Cancel" button

update the UI immediately when cancelled

cleanly terminate the worker or task

Toast stack -- fixed 280 px wide; auto-dismiss completed/cancelled after 8 s; errors persist until manually dismissed; error toasts show the error message as a second line

Theme
Dark and light themes -- Moon/Sun toggle button in toolbar; persists to localStorage under terraforge-theme

Layout Management
Save layout (Ctrl+S) -- saves imports, layer groups, page template, and canvas settings to a .tforge JSON file

Open layout (Ctrl+O) -- restores a saved layout

Close layout -- confirmation prompt before discarding unsaved changes

Page Templates
Built-in page sizes: A2, A3, A4, A5, A6, Letter, Legal, Tabloid; user-customisable via page-sizes.json in app userData

Landscape toggle; configurable margin (mm); non-interactive overlay on canvas

Page clip -- when active, G-code output is clipped to the page printable area instead of the full bed 9. Behavioural Constraints
Never invent FluidNC endpoints

Never block the renderer

Never mix Node APIs into the renderer

Always provide complete file examples when generating code

Keep modules small and composable

Use TypeScript types consistently across layers

Prefer pure functions for SVG/G‑code logic

Maintain architectural consistency across all outputs

All background tasks must be cancellable and must surface UI feedback

10. Output Expectations
    When asked to generate code:

Provide full files, not fragments

Include imports

Include types

Ensure consistency with the architecture above

When asked to design:

Provide diagrams, flow descriptions, or module breakdowns

When asked to extend:

Modify existing modules without breaking the architecture

11. Project Goal
    Produce a complete, maintainable, production‑ready implementation of terraForge that:

imports SVGs

manipulates them visually

generates correct G‑code (linear + optional arcs)

communicates reliably with FluidNC

manages jobs and files

provides a smooth, modern UI

surfaces clear feedback for all background tasks

allows cancellation of any long‑running operation

If you understand this specification, respond with:
“terraForge specification loaded and ready.”
