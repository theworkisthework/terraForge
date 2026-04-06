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
- [ ] Every extracted component has direct focused tests (new or updated), not only parent-level coverage.

## Testing Rule For Extractions

- Use a hybrid test layout:
  - co-located tests for extracted/presentational components (`src/**/ComponentName.test.tsx`)
  - centralized tests for integration/flow behavior (`tests/component/`)
- For every extracted component, add or update a dedicated component test in the same PR (prefer co-located).
- Keep parent/component integration tests, but do not rely on them as the only verification for extracted UI units.
- Minimum expectations per extracted component:
  - render behavior
  - primary interaction callbacks
  - key conditional rendering paths

## UI Icon Guideline

- Prefer Lucide icon components over inline SVG paths wherever an equivalent icon exists.
- Use named Lucide icons directly in JSX for clarity and consistency (e.g. `<RotateCcw />`, `<RotateCw />`, `<Crosshair />`, `<Magnet />`, `<ChevronDown />`).
- Use inline SVG only when no suitable icon exists, or when a custom mark is required by product design.

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

- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow + GroupHeaderRow extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow + GroupHeaderRow + UngroupedDropZone extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow + GroupHeaderRow + UngroupedDropZone + EmptyGroupDropHint extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow + GroupHeaderRow + UngroupedDropZone + EmptyGroupDropHint + HatchFillSection extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow + GroupHeaderRow + UngroupedDropZone + EmptyGroupDropHint + HatchFillSection + AlignmentControls extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow + GroupHeaderRow + UngroupedDropZone + EmptyGroupDropHint + HatchFillSection + AlignmentControls + TransformShortcuts extracted)
- [ ] Create section components and move JSX blocks. (in progress: Toolpath + Layers header + NumberField + PathRow + LayerRow + ImportPathsList + ImportHeaderRow + GroupHeaderRow + UngroupedDropZone + EmptyGroupDropHint + HatchFillSection + AlignmentControls + TransformShortcuts + StrokeWidthSection + DimensionsRow + ImportRowCard + ImportsByGroupList + GroupedImportsSection + UngroupedImportsSection extracted)
- [x] Move formatting/estimation helpers to utilities.
- [x] Move page-template bounds calculation to utilities. (completed: resolvePageBounds)
- [x] Move drag/drop and edit-name logic to hooks. (completed: useImportDragDrop + usePanelNameEditing)
- [x] Move import-row prop wiring to hooks. (completed: useImportRowRenderer)
- [x] Move add-group naming/colour logic to hooks. (completed: useAddLayerGroup)
- [x] Move stroke-width sync logic to hooks. (completed: useSyncedStrokeWidth)
- [x] Move expansion/collapse state to hooks. (completed: usePanelExpansionState)
- [x] Move inspector interaction state to hooks. (completed: useInspectorInteractionState)
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
- [x] Extract collapsible section UI.
- [x] Keep dialog behavior and keyboard controls unchanged.

## Execution Phases

### Phase 0: Guardrails

- [ ] Establish folder conventions and naming.
- [ ] Add file-size/complexity lint guidance (or CI checks).
- [ ] Capture baseline: `typecheck`, unit/component tests.

### Phase 1: Pure Function Extraction

- [x] Extract helpers from Toolbar/Properties/GcodeOptions first.
- [x] Add/adjust unit tests for extracted logic.

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

- [x] Refactor `GcodeOptionsDialog.tsx`
- [ ] Refactor `PropertiesPanel.tsx` (in progress: helpers + Toolpath + Layers header + NumberField + EmptyState extracted)
- [ ] Refactor `PropertiesPanel.tsx` (in progress: helpers + Toolpath + Layers header + NumberField + EmptyState + PathRow extracted)
- [ ] Refactor `PropertiesPanel.tsx` (in progress: helpers + Toolpath + Layers header + NumberField + EmptyState + PathRow + LayerRow extracted)
- [ ] Refactor `Toolbar.tsx`
- [ ] Start `canvasStore.ts` slice extraction

Done this sprint:

- [x] Initialize architecture refactor plan and checklist
- [x] Start `GcodeOptionsDialog.tsx` refactor (prefs + validators extracted, behavior verified)
- [x] Extract `OptionsSection`, `OutputSection`, and `CustomGcodeSection`
- [x] Extract PropertiesPanel toolpath metrics helpers (`formatBytes`, `formatDuration`, `estimateDuration`)
- [x] Extract PropertiesPanel `ToolpathSection` component
- [x] Extract PropertiesPanel `LayersHeader` component
- [x] Extract PropertiesPanel `NumberField` component and rotation constants
- [x] Extract PropertiesPanel `EmptyState` component
- [x] Add focused tests for extracted `gcode-options` and `properties-panel` components
- [x] Extract PropertiesPanel `PathRow` component with co-located tests
- [x] Extract PropertiesPanel `LayerRow` component with co-located tests

## Progress Log

Use this section to track completed steps with date and PR/commit references.

- 2026-04-06: Plan created and checklist initialized.
- 2026-04-06: Started `GcodeOptionsDialog` refactor by extracting prefs persistence and numeric validation helpers into `features/gcode-options`.
- 2026-04-06: Verified `GcodeOptionsDialog` behavior parity with `npm run test -- tests/component/GcodeOptionsDialog.test.tsx` (32/32 tests passing).
- 2026-04-06: Extracted `PathsSection` from `GcodeOptionsDialog` into `features/gcode-options/components/PathsSection.tsx`; targeted dialog tests remain 32/32 passing.
- 2026-04-06: Extracted `OptionsSection`, `OutputSection`, and nested `CustomGcodeSection`; targeted dialog tests remain 32/32 passing.
- 2026-04-06: Extracted `PropertiesPanel` toolpath metric helpers to `features/properties-panel/utils/toolpathMetrics.ts`; targeted panel tests remain 74/74 passing.
- 2026-04-06: Extracted `PropertiesPanel` toolpath UI to `features/properties-panel/components/ToolpathSection.tsx`; targeted panel tests remain 74/74 passing.
- 2026-04-06: Extracted `PropertiesPanel` layers header UI to `features/properties-panel/components/LayersHeader.tsx`; targeted panel tests remain 74/74 passing.
- 2026-04-06: Extracted `PropertiesPanel` shared `NumberField` and rotation constants (`features/properties-panel/components/NumberField.tsx`, `features/properties-panel/utils/rotation.ts`); targeted panel tests remain 74/74 passing.
- 2026-04-06: Extracted `PropertiesPanel` empty-state UI to `features/properties-panel/components/EmptyState.tsx`; targeted panel tests remain 74/74 passing.
- 2026-04-06: Added extracted-component test suites (`tests/component/GcodeOptionsSections.test.tsx`, `tests/component/PropertiesPanelExtractedComponents.test.tsx`, `tests/component/EmptyState.test.tsx`); focused batch passes 11/11.
- 2026-04-06: Adopted hybrid test layout for extracted components by relocating focused tests to co-located files under `src/renderer/src/features/**` and enabling `src/**/*.test.{ts,tsx}` in Vitest include patterns.
- 2026-04-06: Split co-located aggregate extracted tests into per-component files for discoverability (`PathsSection.test.tsx`, `OptionsSection.test.tsx`, `OutputSection.test.tsx`, `CustomGcodeSection.test.tsx`, `ToolpathSection.test.tsx`, `LayersHeader.test.tsx`, `NumberField.test.tsx`, `EmptyState.test.tsx`).
- 2026-04-06: Extracted reusable path item UI into `features/properties-panel/components/PathRow.tsx` and replaced repeated path-row blocks in `PropertiesPanel`; `PathRow.test.tsx` and `PropertiesPanel.test.tsx` pass (76/76 total in run).
- 2026-04-06: Extracted reusable layer header row UI into `features/properties-panel/components/LayerRow.tsx` and replaced inline layer-row block in `PropertiesPanel`; `LayerRow.test.tsx` and `PropertiesPanel.test.tsx` pass (76/76 total in run).

## Update Rule

Whenever a refactor item completes:

1. Tick the matching checkbox.
2. Add one log entry under Progress Log.
3. If scope changed, update this plan in the same PR.
4. Add or update dedicated tests for any extracted components.
