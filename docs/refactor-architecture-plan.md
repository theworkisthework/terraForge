# terraForge Refactor Architecture Plan

Date: 2026-04-06
Status: Active
Owner: Engineering

## Goal

Break down oversized files into focused modules, functions, and React components without changing user-visible behavior.

## Success Criteria

- [ ] All refactor changes keep existing behavior (no regressions).
- [ ] `npm run typecheck` passes after each phase.
- [ ] Relevant tests pass after each phase (`npm test`, plus targeted e2e as needed).
- [ ] Major files move toward size targets:
  - Preferred component size: <= 300 lines
  - Hard cap for orchestration components: <= 500 lines
  - Utility/service module target: <= 250 lines
- [ ] Each extracted module has a single clear responsibility.

## Prioritized Refactor Targets

1. `src/renderer/src/components/PlotCanvas.tsx`
2. `src/renderer/src/components/PropertiesPanel.tsx`
3. `src/renderer/src/components/Toolbar.tsx`
4. `src/workers/gcodeEngine.ts`
5. `src/main/index.ts`
6. `src/renderer/src/store/canvasStore.ts`
7. `src/machine/fluidnc.ts`
8. `src/renderer/src/components/GcodeOptionsDialog.tsx`

## Target Architecture

### Renderer

- Use feature folders under `src/renderer/src/features/` (e.g. `canvas`, `imports`, `gcode-options`).
- Keep container components for orchestration and store wiring.
- Keep presentational components stateless and focused on rendering.
- Move non-visual logic to hooks and pure utility/service modules.

### State (Zustand)

- Split large stores into concern-based slices.
- Move heavy derived logic to selectors/services.
- Keep side-effect-heavy workflows outside store internals where practical.

### Main Process (Electron)

- Separate app bootstrap, window creation, menu construction, and IPC registration.
- Group IPC handlers by namespace (`fluidnc:*`, `serial:*`, `fs:*`, etc.).

### Machine + Worker Domain

- `FluidNCClient`: facade over transport + parser modules.
- G-code engine: split into pipeline stages (tokenize -> normalize -> transform -> optimize -> emit).

## Detailed Breakdown Plan

### 1) PlotCanvas Decomposition

Extract from `src/renderer/src/components/PlotCanvas.tsx`:

- Hooks:
  - `useViewport`
  - `useCanvasPanZoom`
  - `useObjectDrag`
  - `useObjectScaleRotate`
  - `useCanvasKeyboardShortcuts`
- Utilities:
  - geometry math
  - handle bounds math
  - coordinate transform helpers
- Subcomponents:
  - `BedLayer`
  - `GridLayer`
  - `ImportsLayer`
  - `SelectionOverlay`
  - `ToolpathOverlay`
  - `ProgressOverlay`
  - `RulerOverlay`

Checklist:

- [ ] Create `features/canvas/hooks/` and `features/canvas/components/`.
- [ ] Move viewport math into `useViewport`.
- [ ] Move drag/scale/rotate state machines into dedicated hooks.
- [ ] Extract render-only layer components.
- [ ] Keep `PlotCanvas.tsx` as orchestrator (< 500 lines target).

### 2) PropertiesPanel Decomposition

Extract from `src/renderer/src/components/PropertiesPanel.tsx`:

- Section components:
  - `ToolpathSection`
  - `ImportsSection`
  - `LayerGroupsSection`
  - `ImportInspectorSection`
- Utilities:
  - byte formatting
  - duration estimation
- Hooks:
  - group assignment and rename/edit state

Checklist:

- [ ] Create section components and move JSX blocks.
- [ ] Move formatting/estimation helpers to utilities.
- [ ] Move drag/drop and edit-name logic to hooks.
- [ ] Preserve current store API contracts.

### 3) Toolbar Decomposition

Extract from `src/renderer/src/components/Toolbar.tsx`:

- Services:
  - SVG import parse/convert pipeline
  - fill/stroke/layer detection logic
  - G-code import/open actions
- Hooks:
  - `useImportActions`
  - `useLayoutActions`
  - `useJobActions`
- Subcomponents:
  - menu/action groups
  - modal triggers

Checklist:

- [ ] Move SVG import helpers to `features/imports/services/`.
- [ ] Move command orchestration to hooks.
- [ ] Keep `Toolbar.tsx` focused on composition and bindings.

### 4) canvasStore Modularization

Split `src/renderer/src/store/canvasStore.ts` into slices:

- `selectionSlice`
- `importSlice`
- `clipboardSlice`
- `undoRedoSlice`
- `layerGroupSlice`
- `toolpathSlice`
- `pageTemplateSlice`

Checklist:

- [ ] Define slice interfaces and shared store composition.
- [ ] Move heavy conversion and hatch logic to pure services/selectors.
- [ ] Add compatibility layer to avoid breaking existing callers.
- [ ] Migrate callers to selectors incrementally.

### 5) Main Process Modularization

Split `src/main/index.ts` into:

- `main/bootstrap/*` (app lifecycle + window)
- `main/menu/*` (menu builder + safe send helpers)
- `main/ipc/*` (namespace-specific handler registration)

Checklist:

- [ ] Extract window creation and lifecycle wiring.
- [ ] Extract application menu construction.
- [ ] Extract IPC handlers by domain and register centrally.
- [ ] Keep existing IPC channel names unchanged.

### 6) FluidNC Client Modularization

Split `src/machine/fluidnc.ts` into:

- transport modules (`restClient`, `wsClient`)
- parser modules (`statusParser`, `fileParsers`, `firmwareParser`)
- facade (`FluidNCClient`)

Checklist:

- [ ] Extract pure parsers first with unit tests.
- [ ] Extract HTTP helper wrapper and websocket lifecycle manager.
- [ ] Keep public `FluidNCClient` API stable.

### 7) G-code Engine Pipeline Split

Split `src/workers/gcodeEngine.ts` into stages:

- `tokenize`
- `toAbsolute`
- `transform`
- `flatten`
- `optimize`
- `emit`

Checklist:

- [ ] Move pure stage functions to separate modules.
- [ ] Keep worker entrypoint as orchestration only.
- [ ] Add deterministic unit coverage for each stage.

### 8) GcodeOptionsDialog Split

Split `src/renderer/src/components/GcodeOptionsDialog.tsx` into:

- persistence service (`gcodePrefs` load/save/defaults)
- section components (`PathsSection`, `OptionsSection`, `OutputSection`, `CustomGcodeSection`)
- validation helper for numeric input constraints

Checklist:

- [x] Extract prefs persistence and defaults.
- [ ] Extract collapsible section UI.
- [x] Keep dialog behavior and keyboard controls unchanged.

## Execution Phases

### Phase 0: Guardrails

- [ ] Establish folder conventions and naming.
- [ ] Add file-size/complexity lint guidance (or CI checks).
- [ ] Capture baseline: `typecheck`, unit/component tests.

### Phase 1: Pure Function Extraction

- [ ] Extract helpers from Toolbar/Properties/GcodeOptions first.
- [ ] Add/adjust unit tests for extracted logic.

### Phase 2: Hook Extraction

- [ ] Move orchestration logic into custom hooks.
- [ ] Keep component output stable while reducing file size.

### Phase 3: Component Splitting

- [ ] Break large JSX files into section/layer components.
- [ ] Ensure component tests still pass.

### Phase 4: Store Slicing

- [ ] Introduce store slices with stable external API.
- [ ] Migrate callsites gradually.

### Phase 5: Main + Machine + Worker Modularization

- [ ] Split Electron main process modules.
- [ ] Split FluidNC client internals.
- [ ] Split gcodeEngine pipeline.

## Working TODO (Tick As We Go)

Current sprint focus:

- [ ] Refactor `GcodeOptionsDialog.tsx` (in progress: prefs/validation + Paths section extracted)
- [ ] Refactor `PropertiesPanel.tsx`
- [ ] Refactor `Toolbar.tsx`
- [ ] Start `canvasStore.ts` slice extraction

Done this sprint:

- [x] Initialize architecture refactor plan and checklist
- [x] Start `GcodeOptionsDialog.tsx` refactor (prefs + validators extracted, behavior verified)

## Progress Log

Use this section to track completed steps with date and PR/commit references.

- 2026-04-06: Plan created and checklist initialized.
- 2026-04-06: Started `GcodeOptionsDialog` refactor by extracting prefs persistence and numeric validation helpers into `features/gcode-options`.
- 2026-04-06: Verified `GcodeOptionsDialog` behavior parity with `npm run test -- tests/component/GcodeOptionsDialog.test.tsx` (32/32 tests passing).
- 2026-04-06: Extracted `PathsSection` from `GcodeOptionsDialog` into `features/gcode-options/components/PathsSection.tsx`; targeted dialog tests remain 32/32 passing.

## Update Rule

Whenever a refactor item completes:

1. Tick the matching checkbox.
2. Add one log entry under Progress Log.
3. If scope changed, update this plan in the same PR.
