# Future Features

Things we may wish to explore in the future. Do not use this as part of the context for existing work.

## Index

- [Vinyl/paper cutter/drag knife](#vinylpaper-cutterdrag-knife)
- [Inkjet print head](#inkjet-print-head)
- [3D print head](#3d-print-head)

## Vinyl/paper cutter/drag knife

You can add drag-knife support cleanly as a new G-code mode, but it needs geometry compensation in the worker, not just different start/end commands.

### What Already Works For “Cut Only Some Layers”

- Your first-pass assumption is valid today: generation already respects visibility at import, layer, and path level in canvasStore.ts:407, canvasStore.ts:681, and canvasStore.ts:727.
- Layer/path visibility controls are already exposed in PropertiesPanel.tsx:504.
- Per-group export already exists (useful for tool/process separation) in GcodeOptionsDialog.tsx:479 and Toolbar.tsx:1284.

### Key Things To Consider

- Drag knife needs direction-change compensation at corners. Without it, sharp corners get rounded.
- Compensation should handle both convex and concave turns; concave turns typically need more aggressive overcut behavior.
- Path joining can create artificial connectors that are bad for knife cutting; likely disable join mode for drag knife.
- Page clipping can remove compensation moves near boundaries; clip safety must account for blade offset/overcut.
- Closed contours may need lead-in/lead-out strategy and consistent contour direction for predictable results.
- Feedrate may need a slower corner/swivel feed for cleaner pivoting.

### Concrete Changes Required

1. Data model / options

- Extend shared G-code options in index.ts:227 with a drag-knife block, for example:
- enabled
- bladeOffsetMM
- cornerThresholdDeg
- overcutMM
- swivelFeedrateMMMin
- useLeadInOut plus leadInMM/leadOutMM

2. UI options and persistence

- Add drag-knife controls to preferences interface in ` GcodeOptionsDialog.tsx:22`.
- Add controls under Paths/Options in the dialog near existing path controls `GcodeOptionsDialog.tsx:184`.
- Persist these in localStorage via existing load/save pattern in `GcodeOptionsDialog.tsx:58`.

3. Renderer orchestration

- Map new prefs into worker options in both single and per-group generation paths:
- `Toolbar.tsx:1103`
- `Toolbar.tsx:1284`

4. Core compensation algorithm

- Implement drag-knife compensation in the worker pipeline after flattening/clipping and before emission:
- flatten currently comes from `gcodeEngine.ts:552`
  sequencing and join happen in `svgWorker.ts:158` and `svgWorker.ts:165`
- Add a new stage that transforms each polyline into compensated tool-holder moves (corner swivel arcs/segments and overcuts).

5. Generation logic interactions

- For drag-knife mode:
- force joinPaths false (or warn/disable)
- optionally force optimisePaths false initially for predictability, then re-enable once validated
- add metadata comments to header showing drag-knife params in svgWorker.ts:71

6. Clipping behavior

- Current clip is geometric and strict in `gcodeEngine.ts:744`.
- With drag knife, either:
- expand clipping allowance by `bladeOffsetMM` during compensation, or
- require clip safety inset >= `bladeOffsetMM` + `overcutMM` when drag mode is on.

7. Tests

- Add geometry unit tests in `gcodeEngine.test.ts` for:
- 90 degree convex corner compensation
- 90 degree concave corner compensation
- tiny segments / near-collinear turns
- closed contour seam handling
- Extend worker behavior tests in `svgWorker.test.ts:160` and `svgWorker.test.ts:301`.
- Extend dialog tests in `GcodeOptionsDialog.test.tsx` for persistence and validation of new fields.

### Algorithm Direction I’d Recommend (Practical First Pass)

- Convert each subpath to a sequence of linear segments (you already have this).
- For each vertex, compute turn angle from incoming/outgoing unit vectors.
- If absolute turn angle < threshold, keep normal move.
- Otherwise insert:
- a short overcut past the corner
- a swivel arc/segmented arc to align blade to next segment
- then continue along next segment
- Apply slightly lower feed during swivel moves.
- Keep this as a pure geometry transform function in gcodeEngine, then reuse in worker.

### Important caveat about “internal vs external cuts”

- If you mean convex vs concave corners on a contour, the above solves it.
- If you mean true contour offsetting (inside/outside of part geometry), that is a bigger feature (offset path generation, loop nesting, hole/island semantics) and should be a separate phase.

If you want, I can sketch the exact TypeScript shape for the new option object and the compensation function signature so implementation can start with minimal refactoring.

## Inkjet print head

**Status:** Potentially feasible as a hybrid architecture, but not as a direct FluidNC-only feature.

### Core constraints

- FluidNC firmware and APIs cannot be modified.
- FluidNC should continue to control motion.
- Printhead firing must be handled by an external controller.

### What this means technically

- This does not invalidate terraForge work.
- terraForge can still handle artwork import, layout, raster prep, job orchestration, upload, and run control.
- The major addition is a second control channel for the printhead.

### Viable architecture

- FluidNC executes raster scan motion G-code.
- A dedicated printhead controller handles droplet timing and nozzle drive.
- Synchronization should be hardware-assisted, not host-timed over Wi-Fi/serial.

### Sync options (best to weaker)

1. Step/dir or encoder-based sync into printhead controller

- Best determinism for dot placement.
- No FluidNC firmware changes required.

2. Start/end line GPIO strobes from FluidNC plus local fine timing

- Acceptable for coarse line framing.
- Still requires local controller timing for actual droplet firing.

3. Host-timed firing commands only

- Useful for proof of concept only.
- Too much jitter for good print quality.

### IMU question

- IMU is useful for diagnostics and vibration monitoring.
- IMU is not a good primary synchronization source for droplet placement due to drift, noise, and latency.

### terraForge workflow impact

- Add an Inkjet mode that outputs two coordinated artifacts:

1. Motion G-code for FluidNC
2. Raster line payload for printhead controller

- Runtime orchestration:

1. Upload print payload to printhead controller and arm it
2. Upload/run motion G-code on FluidNC
3. Keep dual status in UI (motion plus printhead)
4. Ensure safe pause/resume/abort behavior across both channels

### Practical MVP scope

- Monochrome only
- Unidirectional scanning
- Conservative speed
- Overscan and constant-velocity firing window
- External print controller with hardware sync

### Bottom line

- Feasible, but only with added external electronics and calibration workflow.
- Not feasible as high-quality printing if relying on direct host-timed print triggers alone.

## 3D print head

**Status:** Not feasible within the current terraForge architecture. This is a fundamental platform mismatch, not an incremental feature.

### Why It Won't Work

**1. Binary vs. Continuous Tool Control**

- Current system: `penUpCommand` / `penDownCommand` (discrete on/off states)
- 3D printing needs: continuous E-axis extrusion rate, temperature feedback, nozzle pressure, thermal loops
- The entire state model would require redesign; you cannot treat extrusion as a binary pen toggle

**2. Slicing Problem**

- TerraPen is designed for 2D vector graphics → G-code (X/Y only)
- 3D printing requires slicing: 3D model → 2D layers with:
  - Layer height management and Z-axis step continuity
  - Extrusion width / line width calculations
  - Infill patterns and support structures
  - Bridging and overhang strategies
- This is an entirely separate software stack (Cura, PrusaSlicer, Slic3r)

**3. FluidNC Firmware Incompatibility**

- FluidNC is a **CNC mill controller**, not a 3D printer controller
- 3D printers require:
  - Temperature regulation with thermal runaway protection
  - PWM hotend/bed heater control with feedback loops
  - Extrusion motor ramping synchronized to XY motion
  - Multi-material tool change sequences with purging/priming
- FluidNC has no built-in support for these; GPIO timing is insufficient (same issue as inkjet)
- **You cannot modify FluidNC firmware** to support 3D printing without making it not-a-CNC-controller

**4. Machine Model Mismatch**

- Pen plotters: move fast with discrete pen states
- 3D printers need:
  - Precise Z-height step changes (layer-by-layer)
  - Extrusion rate synchronized to XY motion (volumetric flow control)
  - Print bed heating and thermal monitoring during printing
  - Real-time correction for filament slippage, nozzle clogging, pressure variation

### What Would Actually Be Required

1. **Swap the firmware** — Replace FluidNC with Marlin or Klipper (designed for extrusion-based printing)
2. **Add a slicing engine** — Integrate or fork an existing slicer (thousands of lines of geometry code)
3. **Redesign GcodeOptions** — Add temperature profiles, layer height, extrusion width, speed curves, material presets
4. **Rewrite the canvas model** — Switch from 2D vectors on a bed to 3D model visualization with layer preview
5. **Replace workers** — `svgWorker` becomes a slicer; `gcodeEngine` becomes an extrusion-path generator
6. **Add thermal control UI** — Hotend/bed temperature dialogs, monitoring, emergency shutdown safety

### Conclusion

This is not a feature addition—it requires **building a new product** that happens to share the same UI framework. The plotter and 3D printer pipelines are fundamentally different: vector → pen strokes vs. model → volumetric extrusion. A 3D printer control app is a separate project that should build on an established printer controller (Marlin, Klipper) or a dedicated slicer framework, not on a pen plotter codebase.
