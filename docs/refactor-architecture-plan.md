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
- Full-suite policy: because full validation is long-running, full unit/component and E2E suites are user-executed on request; the agent should run focused/local checks and ask the user to run full suites when needed, then record reported results in Progress Log.
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

PlotCanvas is currently ~3100 lines with 9 distinct responsibilities (viewport, pan/zoom, drag/scale/rotate gestures, keyboard shortcuts, bed/grid rendering, toolpath canvas rendering, overlays). Extract in 6 sequential phases.

#### Phase-1a: Extract Utilities & Constants (Utilities only, no state changes)

Extract pure coordinate math and geometry helpers into `src/renderer/src/features/canvas/`:

- **coordinates.ts** (150 LOC)
  - `mmToSvg(mm, origin, bedW, bedH)` — machine-mm → canvas SVG px (origin-aware)
  - `svgToScreen(x, y, zoom, panX, panY)` — canvas SVG px → screen CSS px (viewport-aware)
  - `screenToSvg(sx, sy, zoom, panX, panY)` — screen px → canvas SVG px
  - `svgToMm(x, y, origin, bedW, bedH)` — canvas SVG px → machine-mm (origin-aware)
  - Unit test: Cover all 5 origin types (bottom-left, top-left, bottom-right, top-right, center)

- **geometry.ts** (200 LOC)
  - `computeFit(containerW, containerH, canvasW, canvasH)` → `{ zoom, panX, panY }`
  - `rotatePoint(ox, oy, angle)` → `[x, y]` (rotate offset by degrees)
  - `computeBoundingBox(imports)` → `{ minX, maxX, minY, maxY }` (AABB in SVG px)
  - `computeOBB(imports, angle)` → `{ cx, cy, hw, hh, angle }` (oriented bounding box)
  - `handleBoundsForBox(cx, cy, hw, hh)` → `Array<[HandlePos, sx, sy]>` (8 handle positions in screen px)
  - `scaleHexColor(hex, factor)` — darken/brighten color (move from PlotCanvas)
  - Unit test: Verify all handle positions for known geometry; test OBB with various rotation angles; test color scaling

- **types.ts**
  - `interface Vp { zoom: number; panX: number; panY: number; }` — viewport state
  - `type HandlePos = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l"`
  - Additional shared canvas types as needed

- **constants.ts** (50 LOC)
  - `MM_TO_PX`, `PAD`, `MIN_ZOOM`, `MAX_ZOOM`, `ZOOM_STEP`
  - Ruler: `RULER_W`, `FONT`, `BG`, `TICK_COL`, `ORIGIN_COL`, `LABEL_COL`
  - Handles: `HANDLE_SCREEN_R`, `DEL_OFFSET_PX`, `DEL_HALF_PX`
  - Cursors: `ROTATE_CURSOR`

**Checklist 1a:**

- [x] Create `src/renderer/src/features/canvas/utils/{coordinates.ts, geometry.ts}` with full coverage unit tests (completed 2026-04-08: 20 coordinates tests + 26 geometry tests passing)
- [x] Create `src/renderer/src/features/canvas/types.ts` with shared interfaces (completed: Vp, HandlePos, CanvasOrigin)
- [x] Create `src/renderer/src/features/canvas/constants.ts` with all magic numbers (completed: 16 constants including rulers, handles, cursors)
- [x] Add `src/renderer/src/features/canvas/index.ts` barrel export (completed: exports all utilities, types, components)
- [x] Update PlotCanvas imports: replace inline helpers with imported utilities (completed: uses MM_TO_PX, PAD, scaleHexColor, rotatePoint, etc.)
- [x] Validate: `npm run typecheck` + `npm run test -- tests/unit/features/canvas/` pass (completed 2026-04-08: 46/46 tests passing, typecheck clean)

**Deliverable:** Step 1a complete. ✅ All utility modules (coordinates.ts, geometry.ts, types.ts, constants.ts) exist with proper exports, full test coverage (46 unit tests), and zero type errors. PlotCanvas and subcomponents cleanly import from barrel.

---

#### Phase-1b: Extract Pure Presentational Subcomponents (No state, render-only)

Extract zero-logic subcomponents that only render props into `src/renderer/src/features/canvas/components/`:

- **BedLayer.tsx** (40 LOC)
  - Input: `bedW`, `bedH`, `bedXMin`, `bedXMax`, `bedYMin`, `bedYMax`
  - Renders: `<rect>` + border for bed background (canvas fills the interior)
  - Unit test: Verify rect dimensions and stroke color

- **GridLayer.tsx** (60 LOC)
  - Input: `bedW`, `bedH`, `getBedY` callback
  - Renders: Major (50mm) + minor (10mm) grid lines
  - Unit test: Verify line count for known bed dimensions; test getBedY callback wiring

- **SelectionOverlay.tsx** (80 LOC)
  - Input: `imports`, `zoom`, `panX`, `panY`, `containerW`, `containerH`, `getBedY`, `activeOBB?`
  - Renders: Dashed polygon around selected AABB or OBB (from GroupHandleOverlay logic)
  - Unit test: Verify polygon points for axis-aligned geometry

**Checklist 1b:**

- [x] Extract `BedLayer.tsx` + unit test (completed 2026-04-08)
- [x] Extract `GridLayer.tsx` + unit test (completed 2026-04-08)
- [x] Extract `SelectionOverlay.tsx` + unit test (completed 2026-04-08)
- [x] Update PlotCanvas to use new components (completed 2026-04-08)
- [x] Validate: `npm run typecheck` + `tests/component/PlotCanvas.test.tsx` (63/63) + E2E bed/grid visual tests (completed 2026-04-08)

**Deliverable:** Step 1b complete. ✅ 3 presentational components extracted and integrated into PlotCanvas with full test coverage (19 co-located tests + 63 PlotCanvas tests all passing).

---

#### Phase-2: Extract Canvas-Rendering Layer (useEffect + RAF + Path2D caching)

Extract the complex ToolpathOverlay rendering logic (currently ~400 LOC in PlotCanvas useEffect):

- **ToolpathOverlay.tsx** (400 LOC)
  - Manages: `<canvas>` ref, RAF debouncing, Path2D caching per import
  - Inputs: `vp`, `containerSize`, `imports`, `selectedImportId`, `allImportsSelected`, `layerGroups`, `gcodeToolpath`, `toolpathSelected`, `plotProgressCuts`, `plotProgressRapids`, `selectedGroupId`, `activeConfig`, coordinate transform helpers
  - Renders: `<canvas>` element with coordinate transforms + stroke styling
  - Responsibilities:
    - Path2D cache invalidation (rebuild when `imp.paths` or `imp.layers` reference changes)
    - LOD (level-of-detail) culling at 0.4px screen-length threshold
    - Plot-progress overlay rendering (cuts + rapids)
    - Bed background fill
  - **CRITICAL:** Extract ref-holding logic carefully; test against known G-code paths
  - Unit test: Mock canvas context; verify setTransform calls for different origins; test LOD culling

**Checklist 2:**

- [x] Extract canvas rendering into `ToolpathOverlay.tsx` preserving all Path2D cache logic
- [x] Add focused unit test for Path2D cache invalidation
- [x] Update PlotCanvas to render `<ToolpathOverlay>` instead of inline useEffect
- [x] Validate: `npm run typecheck` + `tests/component/PlotCanvas.test.tsx` (63/63) + toolpath rendering E2E (pdf-import.spec.ts, gcode-preview.spec.ts)

**Deliverable:** Step 2 complete when: ToolpathOverlay exists and renders identically to current implementation; all toolpath E2E tests pass.

---

#### Phase-3: Extract Viewport & Pan/Zoom Logic into Hooks

Viewport state machine (fit, zoom, pan) and ResizeObserver logic:

- **useViewport.ts** (100 LOC)
  - State: `vp` (viewport), `vpRef` (for closure access)
  - Methods: `setVp()`, `computeFit()`, `fitToView()`
  - Effect: ResizeObserver for responsive resize
  - Returns: `{ vp, setVp, fitToView, computeFit }`
  - Unit test: Mock ResizeObserver; verify fit with various aspect ratios; test preserve-zoom-on-resize

- **useCanvasPanZoom.ts** (80 LOC)
  - State: `containerSize`
  - Methods: `zoomBy(factor, clientX?, clientY?)` (zoom centered on point or container center)
  - Effect: Wheel event listener (non-passive so preventDefault works)
  - Returns: `{ zoomBy, containerSize, setContainerSize }`
  - **Dependency:** Calls `setVp` from `useViewport` (passed as prop or via hook composition)
  - Unit test: Wheel event zoom-in/zoom-out; verify zoom clamping (MIN_ZOOM, MAX_ZOOM); verify screen-point preservation

**Checklist 3:**

- [x] Create `src/renderer/src/features/canvas/hooks/useViewport.ts` + unit test
- [x] Create `src/renderer/src/features/canvas/hooks/useCanvasPanZoom.ts` + unit test
- [x] Create `src/renderer/src/features/canvas/hooks/index.ts` barrel export
- [x] Update PlotCanvas to use hooks; remove inline ResizeObserver + wheel listener
- [x] Validate: `npm run typecheck` + `tests/component/PlotCanvas.test.tsx` (63/63) + zoom/pan E2E (layout.spec.ts)

**Deliverable:** Step 3 complete when: Hooks exist, PlotCanvas uses them, zoom/pan behavior identical; ResizeObserver behavior verified.

---

#### Phase-4: Extract Gesture State & Handlers into Hooks (Drag/Scale/Rotate/OBB)

Four gesture types each have dedicated state machine; extract each into hooks:

- **useObjectDrag.ts** (80 LOC)
  - State: `dragging { id, startMouseX, startMouseY, startObjX, startObjY, group? }`
  - Methods: `startDrag()`, `updateDrag()`, `endDrag()`
  - Logic: Multi-select group-drag detection
  - Returns: `{ dragging, startDrag, updateDrag, endDrag }`
  - Unit test: Single-object drag; group drag; state transitions

- **useObjectScaleRotate.ts** (120 LOC)
  - State: `scaling { id, handle, ... }`, `rotating { id, cx, cy, startAngle, startRotation }`
  - Methods: `startScale()`, `updateScale()`, `endScale()`, `startRotate()`, `updateRotate()`, `endRotate()`
  - Logic: 8-point handle detection, angle calculation (atan2)
  - Returns: `{ scaling, rotating, startScale, updateScale, endScale, startRotate, updateRotate, endRotate }`
  - Unit test: Handle detection for each of 8 positions; rotation angle clamping; scale clamping

- **useGroupOBB.ts** (150 LOC)
  - State: `groupScaling`, `groupRotating`, `groupOBBAngle`, `persistentGroupOBB`
  - Methods: `startGroupDrag()`, `startGroupScale()`, `startGroupRotate()`, `endGroupGesture()`, `clearOBB()`
  - Logic: Oriented bounding box (OBB) rotation accumulation; persistence across gestures
  - **Dependency:** `computeOBB()`, `handleBoundsForBox()` from geometry utils
  - Returns: `{ groupScaling, groupRotating, groupOBBAngle, persistentGroupOBB, ... }`
  - Unit test: OBB angle accumulation; persistence clearing on deselect; handle positions in OBB frame

- **useSpaceKeyPan.ts** (60 LOC)
  - State: `spaceDown`, `isPanning`, `panStartRef`
  - Effects: keydown (space → enable pan mode), keyup (space → disable)
  - Methods: `startPan()` (called on space+mousedown)
  - Returns: `{ spaceDown, isPanning, startPan }`
  - Unit test: Space keydown/keyup; pan mode activation/deactivation

**Checklist 4:**

- [x] Create `src/renderer/src/features/canvas/hooks/useObjectDrag.ts` + unit test (completed 2026-04-08)
- [x] Create `src/renderer/src/features/canvas/hooks/useObjectScaleRotate.ts` + unit test (completed 2026-04-08)
- [x] Create `src/renderer/src/features/canvas/hooks/useGroupOBB.ts` + unit test (completed 2026-04-08)
- [x] Create `src/renderer/src/features/canvas/hooks/useSpaceKeyPan.ts` + unit test (completed 2026-04-08)
- [x] Update PlotCanvas to use hooks; remove inline gesture state/handlers (completed 2026-04-08)
- [x] Validate: `npm run typecheck` + `tests/component/PlotCanvas.test.tsx` (63/63) + interaction E2E (properties-panel.spec.ts) (completed 2026-04-08: 21/21 E2E tests passing)

**Deliverable:** Step 4 complete when: 4 hooks exist, PlotCanvas simplified, gesture behavior identical; all drag/scale/rotate E2E tests pass.

---

#### Phase-5: Extract Keyboard Shortcuts into Hook

- **useCanvasKeyboardShortcuts.ts** (150 LOC)
  - Manages all keydown/keyup listeners:
    - Space: pan mode
    - Delete/Backspace: remove selected item(s)
    - Escape: deselect all
    - Ctrl+Shift+= / Ctrl+Shift+- : keyboard zoom
    - Ctrl+A: select all imports
  - **Dependency:** All hooks from Phase-3, 4; store mutations (selectImport, clearImports, etc.)
  - Returns: nothing (installs listeners via useEffect)
  - Unit test: Mock keyboard events; verify each shortcut triggers correct action

**Checklist 5:**

- [x] Create `src/renderer/src/features/canvas/hooks/useCanvasKeyboardShortcuts.ts` + unit test (completed 2026-04-09)
- [x] Update PlotCanvas to use hook; remove inline keyboard listeners (completed 2026-04-09)
- [x] Validate: `npm run typecheck` + keyboard shortcut E2E (no dedicated spec, but layout.spec.ts + properties-panel.spec.ts cover most) (completed 2026-04-09: full E2E pass 170/170 in 2.4m)

**Deliverable:** Step 5 complete when: Hook exists, PlotCanvas uses it, all keyboard shortcuts work identically.

---

#### Phase-6: Recompose PlotCanvas & Finalize

Pull all extracted pieces together; simplify main PlotCanvas component:

**Checklist 6:**

- [x] Import all utilities, components, and hooks (completed 2026-04-09)
- [x] Consolidate PlotCanvas JSX to pure orchestration (render calls to: BedLayer, GridLayer, ToolpathOverlay, SelectionOverlay, HandleOverlay, GroupHandleOverlay, RulerOverlay, pen position crosshair) (completed 2026-04-09)
- [x] Remove all inline state, effects, event handlers (delegated to hooks) (completed 2026-04-09)
- [x] Target size: PlotCanvas should drop from ~3100 → ~600–800 lines (completed 2026-04-09: 614 lines)
- [x] Validate: `npm run typecheck` + `tests/component/PlotCanvas.test.tsx` (63/63) + `npm run test:e2e` (full suite) (completed 2026-04-09)

**Deliverable:** Step 6 complete when: PlotCanvas is primarily orchestration; all 1167+ unit tests + E2E tests pass; no regressions in canvas behavior.

---

#### Testing Strategy

- **Utilities (Phase 1a):** Pure function unit tests; no mocks needed
- **Components (Phase 1b):** Render tests with props; no store interaction
- **Canvas Overlay (Phase 2):** Mock canvas context; verify Path2D calls
- **Hooks (Phase 3–5):** Mock useEffect, event listeners; verify state transitions
- **Final (Phase 6):** Keep `tests/component/PlotCanvas.test.tsx`; simplify assertions since logic is now in hooks/components

All co-located tests under `src/renderer/src/features/canvas/` with `*.test.ts` or `*.test.tsx` extension.

---

#### Risk Mitigation

1. **Commit per phase:** Each of Phase-1a through Phase-6 = separate commit with passing tests
2. **Parallel rendering:** Validate ToolpathOverlay against known G-code fixtures (gcode-preview.spec.ts)
3. **Gesture accuracy:** Use property-based testing for drag/scale calculations if available
4. **Backwards compatibility:** All extracted functions produce identical output to current implementation (unit tests verify before PlotCanvas changes)

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

- [x] Create section components and move JSX blocks. (completed: ToolpathSection, LayersHeader, NumberField, PathRow, LayerRow, ImportPathsList, ImportHeaderRow, GroupHeaderRow, UngroupedDropZone, EmptyGroupDropHint, HatchFillSection, AlignmentControls, TransformShortcuts, StrokeWidthSection, DimensionsRow, ImportRowCard, ImportsByGroupList, GroupedImportsSection, UngroupedImportsSection)
- [x] Extract panel layout wrappers. (completed: PanelContainer, PanelHeading, PanelScrollBody)
- [x] Move formatting/estimation helpers to utilities.
- [x] Move page-template bounds calculation to utilities. (completed: resolvePageBounds)
- [x] Move drag/drop and edit-name logic to hooks. (completed: useImportDragDrop + usePanelNameEditing)
- [x] Move import-row prop wiring to hooks. (completed: useImportRowRenderer)
- [x] Move add-group naming/colour logic to hooks. (completed: useAddLayerGroup)
- [x] Move stroke-width sync logic to hooks. (completed: useSyncedStrokeWidth)
- [x] Move expansion/collapse state to hooks. (completed: usePanelExpansionState)
- [x] Move inspector interaction state to hooks. (completed: useInspectorInteractionState)
- [x] Move panel-level derived machine/toolpath/group lookup data to hooks. (completed: usePropertiesPanelDerivedData)
- [x] Move store subscriptions to hooks. (completed: usePropertiesPanelStoreBindings)
- [x] Preserve current store API contracts. (validated 2026-04-06 via `npm.cmd run typecheck` and focused PropertiesPanel/component/hook tests)

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

- [x] Move SVG import helpers to `features/imports/services/`. (completed: `svgImportHelpers.ts`)
- [x] Move command orchestration to hooks. (completed: `useImportActions`, `useLayoutActions`, `useJobActions`)
- [x] Keep `Toolbar.tsx` focused on composition and bindings. (validated 2026-04-06 via `npm.cmd run typecheck`, Toolbar unit tests, `npm.cmd run build`, and `npm.cmd run test:e2e`)

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

- [x] Define slice interfaces and shared store composition. (completed: shared `canvasStore/types.ts` plus initial `pageTemplateSlice` and `toolpathSlice` composition)
- [x] Move heavy conversion and hatch logic to pure services/selectors. (completed: `services/hatching.ts` and `services/vectorObjects.ts`)
- [x] Add compatibility layer to avoid breaking existing callers. (completed: composed `useCanvasStore` API preserved, `generateCopyName` re-export kept stable)
- [x] Migrate callers to selectors incrementally. (completed: grouped selector migration across renderer canvas-store consumers)

### 5) Main Process Modularization

Split `src/main/index.ts` into:

- `main/bootstrap/*` (app lifecycle + window)
- `main/menu/*` (menu builder + safe send helpers)
- `main/ipc/*` (namespace-specific handler registration)

Checklist:

- [x] Extract window creation and lifecycle wiring.
- [x] Extract application menu construction.
- [x] Extract IPC handlers by domain and register centrally.
- [x] Keep existing IPC channel names unchanged.

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

### 9) Extracted Component Purification (Second-Pass Decomposition)

Decompose first-wave extracted TSX files into cleaner container vs presentational layers, reduce oversized components, and replace repeated raw markup with reusable React component primitives.

Primary scope:

- `src/renderer/src/features/canvas/components/CanvasOverlays.tsx`
- `src/renderer/src/features/canvas/components/CanvasSceneOverlays.tsx`
- `src/renderer/src/features/canvas/components/ToolpathOverlay.tsx`
- `src/renderer/src/features/properties-panel/components/ImportsByGroupList.tsx`
- `src/renderer/src/features/properties-panel/components/ImportPropertiesForm.tsx`

Architecture constraints:

- Container components: orchestration, store wiring, event handlers, lifecycle effects.
- Presentational components: pure render only, no store reads, no side effects.
- Shared repeated SVG/HTML action markup should be moved into reusable React components.
- Prefer Lucide icons for standard actions when equivalent icons exist.

Checklist:

- [ ] Split large multi-component files into focused modules (one component per file where practical).
- [ ] Extract reusable overlay primitives (selection frame, handle set, rotate stem/handle, delete action badge).
- [ ] Replace repeated inline delete-icon SVG markup with shared React component primitives.
- [ ] Extract geometry/view-model logic into hooks/services (ruler ticks/mapping, handle projection, imports-by-group derivation).
- [ ] Reduce prop-surface complexity for large components by introducing typed prop objects per concern.
- [ ] Apply size guardrails for this stage:
  - Presentational TSX target: <= 180 lines, hard cap <= 250.
  - Container TSX target: <= 280 lines, hard cap <= 400.
  - Hook/service target: <= 220 lines, hard cap <= 300.
- [ ] Add or update focused tests for each extracted component/hook.
- [ ] Validate: `npm run typecheck`, targeted component tests, and full `npm run test:e2e`.

Deliverable:

Stage complete when oversized extracted TSX files are decomposed into clear container/presentational boundaries, repeated raw markup is replaced by reusable React components, and behavior parity is confirmed by typecheck + targeted tests + full E2E.

## Execution Phases

### Phase 0: Guardrails

- [ ] Establish folder conventions and naming.
- [ ] Add file-size/complexity lint guidance (or CI checks).
- [ ] Capture baseline: `typecheck`, unit/component tests.

### Phase 1: Pure Function Extraction

- [x] Extract helpers from Toolbar/Properties/GcodeOptions first.
- [x] Add/adjust unit tests for extracted logic.

### Phase 2: Hook Extraction

- [x] Move orchestration logic into custom hooks. (completed 2026-04-09)
- [x] Keep component output stable while reducing file size. (completed 2026-04-09)

### Phase 3: Component Splitting

- [x] Break large JSX files into section/layer components. (completed 2026-04-09)
- [x] Ensure component tests still pass. (completed 2026-04-09)

### Phase 4: Store Slicing

- [x] Introduce store slices with stable external API.
- [x] Migrate callsites gradually.

### Phase 5: Main + Machine + Worker Modularization

- [x] Split Electron main process modules.
- [ ] Split FluidNC client internals.
- [ ] Split gcodeEngine pipeline.

### Phase 6: Secondary TSX Decomposition and UI Purification

- [ ] Decompose large extracted TSX files into container and presentational layers.
- [ ] Replace repeated raw markup/SVG action controls with reusable React components.
- [ ] Keep behavior stable with passing targeted tests and full E2E.

## Working TODO (Tick As We Go)

Current sprint focus:

- [ ] Execute Stage 9 second-pass decomposition for large extracted TSX components
- [ ] Split `src/machine/fluidnc.ts` internals while preserving `FluidNCClient` API
- [ ] Split `src/workers/gcodeEngine.ts` pipeline stages with deterministic unit tests
- [x] Refactor `GcodeOptionsDialog.tsx`
- [x] Refactor `PropertiesPanel.tsx` (sections/hooks/selectors extracted and validated)
- [x] Continue selector/callsite migration for remaining `canvasStore.ts` consumers
- [x] Modularize `src/main/index.ts` into bootstrap/menu/ipc/events/config modules

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
- [x] Extract `svgImportHelpers.ts` from `Toolbar.tsx` and cover all statements/branches
- [x] Extract `useImportActions`, `useLayoutActions`, and `useJobActions` from `Toolbar.tsx`
- [x] Reduce `Toolbar.tsx` to composition/bindings and re-validate unit, build, and E2E flows
- [x] Start `canvasStore.ts` slice extraction with shared slice types plus `pageTemplateSlice` and `toolpathSlice`
- [x] Extract canvas-store vector projection and hatching logic to pure services/selectors
- [x] Extract `selectionSlice` from `canvasStore.ts`
- [x] Extract `clipboardSlice`, `undoRedoSlice`, and `layerGroupSlice` from `canvasStore.ts`
- [x] Extract `importSlice` and complete `canvasStore.ts` slice composition
- [x] Add focused tests for extracted canvas-store services and slices
- [x] Start grouped selector migration for `canvasStore.ts` consumers
- [x] Migrate `PlotCanvas.tsx` to grouped canvas selectors
- [x] Migrate remaining small canvas-store consumers to grouped selectors
- [x] Reorganize canvas selectors by feature/concern

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
- 2026-04-06: Extracted Toolbar SVG import parsing helpers to `features/imports/services/svgImportHelpers.ts` and raised the helper test suite to 100% statements, branches, functions, and lines.
- 2026-04-06: Extracted Toolbar orchestration into `features/imports/hooks/useImportActions.ts`, `features/layout/hooks/useLayoutActions.ts`, and `features/machine/hooks/useJobActions.ts`; `Toolbar.tsx` now acts primarily as composition and UI bindings.
- 2026-04-06: Fixed post-extraction path regressions for shared types and worker resolution; validation passes with `npm.cmd run typecheck`, Toolbar unit tests (84/84), `npm.cmd run build`, `npm.cmd run test:e2e`, and the full unit suite.
- 2026-04-06: Started `canvasStore.ts` modularization by defining shared slice interfaces in `store/canvasStore/types.ts` and extracting `pageTemplateSlice.ts` plus `toolpathSlice.ts`; validation passes with `npm.cmd run typecheck` and `tests/unit/stores/canvasStore.test.ts` (105/105).
- 2026-04-06: Extracted duplicated canvas-store vector projection and hatch regeneration logic to `store/canvasStore/services/vectorObjects.ts` and `store/canvasStore/services/hatching.ts`; focused `canvasStore.test.ts` still passes 105/105.
- 2026-04-06: Extracted `store/canvasStore/slices/selectionSlice.ts` and composed it into `canvasStore.ts`; `npm.cmd run typecheck` and `tests/unit/stores/canvasStore.test.ts` remain green (105/105).
- 2026-04-06: Extracted `store/canvasStore/services/clipboard.ts`, `store/canvasStore/slices/clipboardSlice.ts`, `store/canvasStore/slices/undoRedoSlice.ts`, and `store/canvasStore/slices/layerGroupSlice.ts`; preserved API compatibility by re-exporting `generateCopyName` from `canvasStore.ts`; validation remains green with `npm.cmd run typecheck` and `tests/unit/stores/canvasStore.test.ts` (105/105).
- 2026-04-06: Extracted `store/canvasStore/slices/importSlice.ts`, leaving `canvasStore.ts` as slice composition plus `pushUndo` wiring; added focused tests for `pageTemplateSlice`, `toolpathSlice`, `selectionSlice`, `clipboard` service, `clipboardSlice`, `undoRedoSlice`, `layerGroupSlice`, and `importSlice`; validation remains green with `npm.cmd run typecheck`, focused slice/service tests, and `tests/unit/stores/canvasStore.test.ts` (105/105).
- 2026-04-06: Started grouped selector migration for `canvasStore.ts` consumers by adding `store/canvasStoreSelectors.ts` and moving `Toolbar.tsx`, `GcodeOptionsDialog.tsx`, `useImportActions.ts`, `useLayoutActions.ts`, `useJobActions.ts`, and `usePropertiesPanelStoreBindings.ts` to shallow selector subscriptions; validation passes with `npm.cmd run typecheck`, the full `runTests` suite (170/170), and `tests/unit/stores/canvasStore.test.ts` (105/105).
- 2026-04-06: Migrated `PlotCanvas.tsx` to grouped `canvasStore` selectors and replaced the remaining inline `showCentreMarker` subscription in `HandleOverlay`; validation passes with `npm.cmd run typecheck`, `tests/component/PlotCanvas.test.tsx` (63/63), and `tests/unit/stores/canvasStore.test.ts` (105/105).
- 2026-04-06: Migrated `FileBrowserPanel.tsx`, `JobControls.tsx`, and `usePlotProgress.ts` to grouped `canvasStore` selectors; validation passes with `npm.cmd run typecheck`, `tests/component/FileBrowserPanel.test.tsx` (31/31), `tests/component/JobControls.test.tsx` (22/22), and `tests/unit/usePlotProgress.test.tsx` (19/19).
- 2026-04-06: Completed renderer-wide `canvasStore` callsite migration to grouped selectors; `grep` confirms remaining `useCanvasStore(...)` consumers all route through named selector helpers in `store/canvasStoreSelectors.ts`.
- 2026-04-06: Reorganized the selector layer from single-file `store/canvasStoreSelectors.ts` into feature-grouped modules under `store/canvasSelectors/` with a barrel export; validation passes with `npm.cmd run typecheck` and the full `runTests` suite (170/170).
- 2026-04-06: Extracted Electron main bootstrap/window responsibilities from `src/main/index.ts` to `src/main/bootstrap/window.ts` and `src/main/bootstrap/lifecycle.ts`; corrected output-path resolution for electron-vite flattened bundle; launch e2e (`tests/e2e/launch.spec.ts`) passes 21/21.
- 2026-04-06: Extracted menu construction and menu-state IPC listeners to `src/main/menu/applicationMenu.ts`; validation passes with `npm.cmd run typecheck`, `npm.cmd run build`, and launch e2e 21/21.
- 2026-04-06: Extracted app/config/tasks/jobs IPC registration to `src/main/ipc/app.ts`, `src/main/ipc/config.ts`, `src/main/ipc/tasks.ts`, and `src/main/ipc/jobs.ts`; kept channel names stable and validated with typecheck/build/launch e2e.
- 2026-04-06: Extracted remaining transport and file IPC registration to `src/main/ipc/fluidnc.ts` and `src/main/ipc/fs.ts`; `src/main/index.ts` now acts as composition root; launch e2e remains 21/21.
- 2026-04-06: Extracted push-event forwarding to `src/main/events/pushEvents.ts` and machine/page-size persistence to `src/main/config/persistence.ts`; promoted defaults/constants out of `src/main/index.ts` and validated with `npm.cmd run typecheck` plus launch e2e 21/21.
- 2026-04-06: Completed main-process polish pass with barrel exports (`src/main/ipc/index.ts`, `src/main/events/index.ts`, `src/main/config/index.ts`), FS dialog filter de-duplication, and persistence default cloning safeguards; typecheck and launch e2e remain green (21/21).
- 2026-04-06: Added focused main-process unit tests for extracted modules: `tests/unit/main/ipc.config.test.ts`, `tests/unit/main/ipc.fluidnc.test.ts`, and `tests/unit/main/persistence.test.ts`; targeted run passes 10/10 and `npm.cmd run typecheck` remains green.
- 2026-04-06: Expanded main-process coverage with dedicated tests for bootstrap, menu, events, and lightweight IPC registration modules (`tests/unit/main/bootstrap.*.test.ts`, `tests/unit/main/menu.applicationMenu.test.ts`, `tests/unit/main/events.pushEvents.test.ts`, `tests/unit/main/ipc.{app,fs,jobs,tasks}.test.ts`) plus broader branch coverage in config/fluidnc tests; `npx.cmd vitest run tests/unit/main` passes 37/37 and coverage is materially improved.
- 2026-04-09: Started PlotCanvas Phase 5 keyboard extraction by adding `useCanvasKeyboardShortcuts` and moving inline key listeners out of `PlotCanvas.tsx`; updated `useSpaceKeyPan` to expose `setSpacePressed` while keeping pan gesture state local; validation passes with `npm.cmd run typecheck` and focused tests (`useCanvasKeyboardShortcuts`, `useSpaceKeyPan`, `PlotCanvas`) 82/82.
- 2026-04-09: Completed Phase 5 validation with full E2E run passing 170/170 in 2.4 minutes; keyboard shortcut behavior remains stable through integration coverage.
- 2026-04-09: Advanced Phase 6 by extracting in-file canvas overlays from `PlotCanvas.tsx` into `features/canvas/components/CanvasOverlays.tsx` and `features/canvas/components/CanvasSceneOverlays.tsx`; removed duplicated pen-crosshair render block; `PlotCanvas.tsx` reduced to 614 lines and validation remains green with `npm.cmd run typecheck` plus `tests/component/PlotCanvas.test.tsx` (63/63).
- 2026-04-09: Completed Phase 6 validation pass with `npm.cmd run typecheck`, `tests/component/PlotCanvas.test.tsx` (63/63), and full `npm.cmd run test:e2e` run exiting cleanly (code 0).
- 2026-04-09: Completed final Phase 6 orchestration cleanup by extracting remaining `PlotCanvas.tsx` inline toolpath sync, gesture lifecycle, and interaction handlers into `useToolpathSelectionSync`, `useCanvasGestureLifecycle`, and `useCanvasInteractionHandlers`; validation remains green with `npm.cmd run typecheck` and `npm.cmd run test -- tests/component/PlotCanvas.test.tsx` (63/63).
- 2026-04-09: Re-validated end-to-end stability after Phase 6 completion with a fresh full E2E pass: 170/170 passing in 1.9 minutes.
- 2026-04-09: Reconciled plan summary checkboxes with completed detailed work (Execution Phase 2/3 now marked complete); no functional code changes in this pass.
- 2026-04-10: Full unit/component suite re-validated by user-run `npm test`: 104/104 test files and 1316/1316 tests passing (duration 222.93s; transform 58.71s, setup 146.94s, import 138.58s, tests 169.13s, environment 891.88s).
- 2026-04-10: Stage 9 started with canvas overlay decomposition: extracted shared `DeleteActionBadge` primitive, replaced repeated canvas delete-action markup, switched to Lucide `SquareX`, and split `CanvasOverlays.tsx` into per-component modules (`RulerOverlay`, `ImportLayer`, `GroupHandleOverlay`, `HandleOverlay`) while keeping `CanvasOverlays.tsx` as a compatibility barrel; `npm.cmd run typecheck` passes.
- 2026-04-10: Continued Stage 9 canvas decomposition by splitting `CanvasSceneOverlays.tsx` into focused modules (`PageTemplateOverlay`, `ToolpathHitAreaOverlay`, `ToolpathSelectionOverlay`, `PenCrosshairOverlay`) and preserving `CanvasSceneOverlays.tsx` as a compatibility barrel; `npm.cmd run typecheck` passes.
- 2026-04-10: Continued Stage 9 by decomposing `ToolpathOverlay.tsx` heavy drawing blocks into `features/canvas/utils/toolpathOverlayDraw.ts` (`drawImportsLayer`, `drawToolpathLayer`) and reducing overlay component responsibility to orchestration/canvas lifecycle; `npm.cmd run typecheck` passes.
- 2026-04-10: Continued Stage 9 properties-panel decomposition by extracting `useImportPropertiesFormModel` (behavior/actions) and `PositionFieldsRow` (X/Y layout) from `ImportPropertiesForm.tsx`, preserving component API and behavior while tightening functionality vs presentation separation; `npm.cmd run typecheck` passes.
- 2026-04-10: Continued Stage 9 properties-panel decomposition by extracting `useImportsByGroupListModel` to isolate page-bound derivation + import-row renderer wiring from `ImportsByGroupList.tsx`; added focused hook coverage in `useImportsByGroupListModel.test.tsx`; validation passes with `npm.cmd run typecheck` and `npm.cmd run test -- src/renderer/src/features/properties-panel/hooks/useImportsByGroupListModel.test.tsx` (1/1).
- 2026-04-10: Follow-up Stage 9 cleanup to reduce visible component size: moved grouped/ungrouped section prop assembly into `useImportsByGroupListModel`, extracted shared `ImportsByGroupListProps` type to `ImportsByGroupList.types.ts`, and reduced `ImportsByGroupList.tsx` to thin composition (`GroupedImportsSection` + `UngroupedImportsSection` spreads); validation remains green with `npm.cmd run typecheck` and focused hook test 1/1.
- 2026-04-10: Continued Stage 9 properties-panel decomposition by extracting `TransformControlsSection` (Scale/Rotation fields + shortcut rows) from `ImportPropertiesForm.tsx` and exporting `TransformShortcutsProps` for typed composition; added focused coverage in `TransformControlsSection.test.tsx`; validation passes with `npm.cmd run typecheck` and `npm.cmd run test -- src/renderer/src/features/properties-panel/components/TransformControlsSection.test.tsx` (1/1).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by moving remaining `ImportPropertiesForm.tsx` inline callback logic (`onChangeX/Y`, `onAlignX/Y`, `onChangeScale`, `onChangeRotation`) into `useImportPropertiesFormModel`; added focused hook coverage in `useImportPropertiesFormModel.test.ts`; validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/hooks/useImportPropertiesFormModel.test.ts` (1/1), and `npm.cmd run test -- src/renderer/src/features/properties-panel/components/ImportPropertiesForm.test.tsx` (6/6).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by extracting shared `ImportPropertiesFormProps` into `ImportPropertiesForm.types.ts` and moving alignment + dimensions composition into `AlignmentDimensionsSection`; `ImportPropertiesForm.tsx` now composes section components with reduced inline structure; focused validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/components/AlignmentDimensionsSection.test.tsx` (1/1), and `npm.cmd run test -- src/renderer/src/features/properties-panel/components/ImportPropertiesForm.test.tsx` (6/6).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by splitting `AlignmentControls.tsx` into a thin container plus extracted model/presentation units (`hooks/useAlignmentControlsModel.ts`, `components/AlignmentButtonsRow.tsx`), moving bounds/title derivation and align callback wiring out of the parent component; focused validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/hooks/useAlignmentControlsModel.test.ts` (2/2), `npm.cmd run test -- src/renderer/src/features/properties-panel/components/AlignmentButtonsRow.test.tsx` (1/1), and `npm.cmd run test -- src/renderer/src/features/properties-panel/components/AlignmentControls.test.tsx` (2/2).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by reducing `ImportRowCard.tsx` to composition: extracted shared prop contract to `components/ImportRowCard.types.ts` and moved selected-details wrapper/form rendering to `components/ImportRowCardDetails.tsx`; added focused coverage in `ImportRowCardDetails.test.tsx`; validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/components/ImportRowCard.test.tsx` (4/4), and `npm.cmd run test -- src/renderer/src/features/properties-panel/components/ImportRowCardDetails.test.tsx` (1/1).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by reducing `TransformShortcuts.tsx` to orchestration-only composition: extracted the prop contract to `components/TransformShortcuts.types.ts`, moved rotation-step menu UI to `components/RotationStepFlyout.tsx`, and moved repeated action-button markup to `components/TransformIconButton.tsx`; added focused component coverage for extracted units (`RotationStepFlyout.test.tsx`, `TransformIconButton.test.tsx`); validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/components/TransformShortcuts.test.tsx` (2/2), `npm.cmd run test -- src/renderer/src/features/properties-panel/components/RotationStepFlyout.test.tsx` (2/2), and `npm.cmd run test -- src/renderer/src/features/properties-panel/components/TransformIconButton.test.tsx` (2/2).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by reducing `DimensionsRow.tsx` to composition: extracted shared prop contract to `components/DimensionsRow.types.ts`, moved width/height transform behavior and ratio-lock action wiring into `hooks/useDimensionsRowModel.ts`, and extracted reusable presentation primitives `components/DimensionInputField.tsx` and `components/RatioLockToggleButton.tsx`; added focused tests for each extracted module (`useDimensionsRowModel.test.ts`, `DimensionInputField.test.tsx`, `RatioLockToggleButton.test.tsx`); validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/components/DimensionsRow.test.tsx` (8/8), `npm.cmd run test -- src/renderer/src/features/properties-panel/hooks/useDimensionsRowModel.test.ts` (2/2), `npm.cmd run test -- src/renderer/src/features/properties-panel/components/DimensionInputField.test.tsx` (1/1), and `npm.cmd run test -- src/renderer/src/features/properties-panel/components/RatioLockToggleButton.test.tsx` (2/2).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by reducing `ImportHeaderRow.tsx` to composition: extracted shared prop contract to `components/ImportHeaderRow.types.ts`, moved row interaction/action wiring to `hooks/useImportHeaderRowModel.ts`, and extracted edit/view name rendering to `components/ImportNameField.tsx`; added focused tests for extracted modules (`useImportHeaderRowModel.test.ts`, `ImportNameField.test.tsx`); validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/components/ImportHeaderRow.test.tsx` (2/2), `npm.cmd run test -- src/renderer/src/features/properties-panel/components/ImportNameField.test.tsx` (2/2), and `npm.cmd run test -- src/renderer/src/features/properties-panel/hooks/useImportHeaderRowModel.test.ts` (1/1).
- 2026-04-10: Continued Stage 9 properties-panel decomposition by reducing `GroupedImportsSection.tsx` to composition: extracted shared prop/view-model contracts to `components/GroupedImportsSection.types.ts`, moved grouped-member and state derivation into `hooks/useGroupedImportsSectionModel.ts`, and extracted per-group presentation to `components/GroupedImportsGroup.tsx`; added focused tests for extracted modules (`useGroupedImportsSectionModel.test.ts`, `GroupedImportsGroup.test.tsx`); validation passes with `npm.cmd run typecheck`, `npm.cmd run test -- src/renderer/src/features/properties-panel/components/GroupedImportsSection.test.tsx` (3/3), `npm.cmd run test -- src/renderer/src/features/properties-panel/components/GroupedImportsGroup.test.tsx` (2/2), and `npm.cmd run test -- src/renderer/src/features/properties-panel/hooks/useGroupedImportsSectionModel.test.ts` (1/1).

## Update Rule

Whenever a refactor item completes:

1. Tick the matching checkbox.
2. Add one log entry under Progress Log.
3. If scope changed, update this plan in the same PR.
4. Add or update dedicated tests for any extracted components.
