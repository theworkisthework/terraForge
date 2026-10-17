# Bitmap renderer plugin — review findings and remediation plan

A review of the bitmap renderer subsystem as of branch
`feature/plugin-architecture-for-bitmap-renderer`, uncommitted work included:
the in-tree renderers, the tone-spine engine, materialisation and colour
separation, the properties-panel render trigger, and the external plugin path
(manifest discovery, host manager, sandbox).

All 194 existing bitmap/renderer unit tests pass. Findings marked
**(verified)** were reproduced with a scratch script against the real modules;
the rest come from reading the code.

Severity: **High** = wrong plotted output or silent data/feature loss.
**Medium** = visible quality defect, or a robustness gap that a realistic
input will hit. **Low** = polish, consistency, or latent risk.

## Status

| Item | State | Commit |
|---|---|---|
| 1. Stale geometry plotted | Fixed — render service plus G-code flush guard (also delivers A4) | `e2cfd47` |
| 2. `producesDots` dropped | Fixed, then superseded: A5 replaced `producesDots` with dots returned as data | `f37600b` |
| 3. Strand start / closed shapes | Fixed (sine re-entry too) | `c36a718` |
| 4. `clipToImage = false` bleed | Fixed | `697bcf3` |
| 5. Settings not coerced | Fixed — `coerceSettings` (per-renderer clamp code removed in A1) | `4f48b99` |
| 6. Clip entry/exit | Fixed — entry in `c36a718`, exit in `3d45296` | `3d45296` |
| 7. Tone smoothing lag | Fixed by A3 — engine EMA replaced by a symmetric source blur | `6dddf4f` |
| 9. Halftone tone curve | Area fix done (`f5ffab7`); tone controls via A3; edge overflow still open | `f5ffab7` |
| 12. Renderer code changes undetected | Fixed — version stamp per render; version-only staleness offers **Re-render** and plots as shown | `3c96690` |
| A3. Tone preprocessing | Done — `toneAdjust.ts`; per-import Tone section for every renderer and plugin; auto levels still per ink channel under separation (issue 15) | `6dddf4f` |
| A1. Tone-spine renderer factory | Done — `defineToneSpineRenderer`; per-renderer clamp code gone (renderers coerce their own settings); output verified byte-identical across 96 cases | `0fb3342` |
| 13. Stale "Sawtooth width" label | Fixed in A1; other items in 13 still open | `0fb3342` |
| 8. Silent truncation | Fixed in A5 — one point budget per render, truncation reported as a warning; spiral reports its own cap | `754c875` |
| 10. Fragile dot splitting | Fixed in A5 — dots are data (`{ d, x, y }`), nothing is parsed | `754c875` |
| 14. Import ignored `paths` | Fixed in A5; decode limits still open | `754c875` |
| A5. Structured result | Done, kept as API version 1 (unreleased) — `{ layers, warnings }`, dot layers; docs and examples checked | `754c875` |
| A2. Off-thread rendering | Done for in-tree renderers — worker pool, parallel ink channels, superseded renders aborted (worker terminated). Decode and tone preparation still run on the main thread | `7c47b8a` |
| Everything else | Open | — |

---

## Part 1 — Issues

### 1. Stale geometry can be plotted — rendering is tied to the panel being open (High)

**Where:** `BitmapRendererSection.tsx:92-162`, `vectorObjects.ts:110`

The only thing that re-renders a bitmap after a settings change is the
`useEffect` inside `BitmapRendererSection`. If the user changes a setting and
then deselects the import, or the panel unmounts for any other reason, before
the 400 ms debounce and the render finish, the cleanup cancels the run.
`bitmapRenderSignature` then no longer matches the settings, and nothing
re-runs the render until that import is selected again. G-code generation reads
`bitmapRendererPath`/`paths` directly and never checks the signature, so the
job plots the previous settings' geometry while the panel shows the new
settings.

The same gap applies to any change made outside the panel, such as a future
batch edit or a scripted change.

**Remediation**
1. Move render scheduling out of the component into a small store-level
   service (e.g. `bitmapRenderService.ts`). It subscribes to the canvas
   store, finds every bitmap import whose stored signature ≠ the current
   signature, and debounces and renders each one independently of selection.
   The panel then only *reads* a per-import status (`pending` / `rendering` /
   `error`) from that service.
2. Add a guard in G-code generation (or in `vectorObjects`): if any visible
   bitmap import's signature is stale, either await the service's in-flight
   render for it or refuse with a clear "bitmap is still rendering" message.
3. Test: change a setting, unmount the panel immediately, and assert that the
   geometry is updated once the debounce has elapsed.

### 2. `producesDots` is dropped for external plugins (High)

**Where:** `src/main/plugins/pluginManifest.ts:255-266`

`discoverBitmapPlugins` builds the manifest it sends to the renderer from an
explicit field list (`id`, `label`, `apiVersion`, `defaults`, `fields`,
`renderTimeoutMs`, `source`). `producesDots` is not in that list, so
`pluginRendererFromManifest` always receives `undefined`. A dot-producing
plugin's output is never split into fillable, plot-tappable dots. The field is
also never validated, and `renderer-plugin-authoring.md` doesn't document it.

**Remediation**
- Validate it in `validateManifestShape` (it must be a boolean if present),
  copy it into the record, and document it in the authoring guide.
- Add a discovery test that round-trips every optional manifest field, so
  the next optional field can't go missing the same way.

### 3. Piecewise-linear strands lose their first partial cycle; closed shapes don't close (High, verified)

**Where:** `toneSpine/engine.ts:301-370`

For triangle, square and sawtooth, the engine draws only at breakpoint
crossings and at the strand's final point. Crossings are taken *strictly
after* the previous phase, and the first `visit()` has zero arc length, so the
strand's start point is never drawn. Measured on a 100 px dark line with a
10 px tooth:

| Waveform | First drawn x | Missing |
|---|---|---|
| sine | 0 | — |
| triangle | 0.83 | ¼ cycle |
| square | 1.67 | ½ cycle |
| sawtooth | 3.33 | a full tooth |

Consequences:
- Every ring, box and polygon strand has a gap at its start angle, which
  sweeps around as `angleDeg` changes.
- Every raster, isometric and burst line starts short of the image edge.
- The same thing happens after every `clipToImage` re-entry (the `broken`
  path), so lines also start short wherever they re-enter the image.

**Remediation**
- In `visit`, when `broken` is true (the strand's start or a re-entry), push
  the current base point at the current phase before processing crossings. On
  re-entry, use the interpolated boundary point (see issue 6) rather than
  the first inside sample.
- Add an engine test, parametrised over all four waveforms: the first drawn
  point of an in-bounds strand equals its first base point (after
  displacement).

### 4. `clipToImage = false` draws the entire spine outside the image (Medium, verified)

**Where:** `toneSpine/engine.ts:330`; the spine generators in
`spiralAmplitude.ts`, `circularRings.ts`, `concentricBoxes.ts` and
`concentricPolygons.ts`

The setting is documented as letting geometry "overflow by up to the amplitude
setting". In practice, turning it off also disables the outside-bounds skip,
so every base point is drawn. The spiral, ring, box and polygon generators
deliberately extend to the *farthest image corner*, so on a non-square image
this produces large areas of plain, unmodulated geometry well outside the
picture. A 4:1 test image produced 438 points, 218 of them more than the
amplitude beyond the image edge. For a radial burst whose origin is outside
the image, the rays are drawn as straight spokes from the origin up to the
image edge.

**Remediation:** split the two concerns the flag currently conflates:
- Always break the strand where the *base* spine leaves the image (that is
  the extent of the picture, not a style choice).
- Let `clipToImage` govern only whether the *displaced* point is clamped.

That matches the documented intent. Add a test asserting that no point lies
more than `amplitude` outside the image when `clipToImage` is false.

### 5. Settings are never validated against the field schema; a missing key yields `NaN` paths (Medium, verified)

**Where:** each renderer's settings-parsing block; `bitmapImage.ts:244`

Every renderer clamps its own numbers with
`Math.max(lo, Math.min(Number(x), hi))`. `Number(undefined)` is `NaN`, and
`NaN` passes through both `Math.min` and `Math.max`, so a missing or
non-numeric value produces `MNaN NaN …`. That path is then rejected by
`validateRendererPath` as a render failure. This was reproduced with circular
rings and no `amplitudeMM`. Defaults currently mask it, but it will happen
with:
- a saved file from a version that used a different key (spiral already uses
  `amplitude` while every other renderer uses `amplitudeMM` — see issue 13),
- a hand-edited file,
- a plugin whose defaults change between versions.

It was worse than a bad path: with `NaN` spacing, the concentric-boxes loop
(`for (let k = 1; ; k++)`, exiting on a comparison that is always false for
`NaN`) never terminated, hanging the UI thread. This surfaced when the
regression tests were run without the fix.

The per-renderer clamp ranges also duplicate each field's `min`/`max`, and
the two must be edited in lockstep. The current diff changes both in eight
files.

Plugins get no validation at all: whatever is in the saved settings bag is
posted into the sandbox.

**Remediation:** add a single `coerceSettings(fields, defaults, settings)` in
`bitmapImage.ts`, applied before `render()` for in-tree and plugin renderers
alike:
- number → finite, clamped to `[min, max]`, or the default if not finite;
- boolean → boolean, or the default;
- select → one of the option values, or the default;
- unknown keys → dropped (or passed through, decided once).

With that in place, renderers can read typed values and lose all their clamp
code (see Part 2, A1). Also clamp `defaults` against `min`/`max` in manifest
validation; today it only checks the type.

### 6. Clip re-entry and exit draw short segments along the image border (Low)

**Where:** `toneSpine/engine.ts:330-361`

When a strand re-enters the image, `visit` uses the *outside* previous point
as `segmentStart`. Breakpoint crossings that fall in the outside part of that
segment are interpolated outside the image and then clamped onto the edge,
leaving short slivers along the border. On exit, the tail between the last
inside sample and the boundary is lost.

**Remediation:** clip each base segment against the image rectangle (the
`clipLineToRect` logic already exists in `lineFamily.ts`), and start or end
the strand at the intersection point. This pairs naturally with the fixes for
issues 3 and 4.

### 7. Tone smoothing depends on waveform and spine resolution, and lags (Medium)

**Where:** `toneSpine/engine.ts:194, 341-345`

`TONE_SMOOTHING` is an exponential moving average applied *per visit*, not
per unit distance:
- Sine visits ~24 times per tooth; the piecewise waveforms visit once per
  base segment (`toothWidth / 4`).
- With α = 0.2 (time constant ≈ 5 visits), that is ≈ 0.2 teeth of smoothing
  for sine against ≈ 1.25 teeth for triangle, square and sawtooth. Changing
  the waveform therefore also changes tonal sharpness.
- A one-sided EMA also *shifts* tone in the direction of travel. Raster lines
  all lag the same way (edges smear to the right), and spiral and ring
  features skew rotationally.

**Remediation:** remove the EMA and instead pre-filter the source once per
render with a small separable box or Gaussian blur, radius in mm converted to
px. A pre-filter is symmetric (no lag) and independent of waveform and
sampling density. It is also cheaper, and it belongs with the other tone
preprocessing in Part 2, A3. If an EMA is kept, make α distance-based:
`α = 1 − exp(−d / L)`.

### 8. Point caps silently truncate output (Medium)

**Where:** `toneSpine/engine.ts:199` (`MAX_STRAND_POINTS` = 200k per strand),
`spiralAmplitude.ts:77` (500k generator cap)

- **Spiral (one strand):** a fine spacing on a large print stops part-way
  out, with no indication to the user.
- **Multi-strand renderers:** the cap is per strand, so the total is
  unbounded until the 64 MB path-length check throws a hard failure. The
  failure message says nothing about which setting to change.

**Remediation**
- Use one per-render point budget shared across strands.
- When it's hit, return the truncated result *with a warning*. This needs a
  way for `render()` to report warnings, e.g.
  `RendererLayer.warnings?: string[]`, or a result wrapper (see Part 2, A5).
  The panel then shows "Output truncated — increase spacing".
- Estimate output size from the settings before rendering and warn early.

### 9. Dot halftone tone reproduction is non-linear and ignores tone controls (Medium)

**Where:** `dotHalftone.ts:90-93`

- **Tone curve:** radius is proportional to darkness, so ink *area* is
  proportional to darkness². A 50 % grey gets 25 % of the maximum dot area,
  which crushes midtones and shadows. Use
  `radius = maxRadius * Math.sqrt(toneDark)` for area-proportional coverage.
- **Missing controls:** halftone has no `autoLevels` or `contrast` because
  those live inside the tone-spine engine. Moving tone shaping into a
  pre-render source step fixes this for every renderer, including plugins
  (Part 2, A3).
- **Overflow:** dots aren't clipped to the image. With `dotScale` > 1 the
  edge dots overflow the image.

### 10. Dot splitting is fragile for anything but the in-tree halftone (Medium, verified)

**Where:** `bitmapImage.ts:185-187`

- `split(/(?=M)/)` ignores relative `m`.
- The coordinate regex `-?\d+(\.\d+)?` doesn't handle exponents (`1e-7`),
  leading-dot numbers (`.5`), or arc and `H`/`V` arguments.

`"M1e-7 5 L2 5 L1 6 Z m 3 3 l 1 0 Z"` came back as one dot with centroid
(4, 0). Today only the in-tree halftone produces dots, but once issue 2 is
fixed, plugin output will flow through this function, and
`validateRendererPath` accepts all of those forms.

**Remediation:** either
- validate and document a strict dot grammar for `producesDots` output
  (absolute `M`/`L`/`Z` only, plain decimals) and reject anything else with a
  clear error, or
- parse with the app's existing SVG path utilities.

Also exclude a repeated closing vertex from the centroid, if one is present.

### 11. Plugin ids can collide with in-tree ids (Low)

**Where:** `registry.ts:44-53`, `pluginManifest.ts:249`

`findBitmapRenderer` checks in-tree renderers first, so a plugin with id
`spiral-amplitude` is silently shadowed. The dropdown in
`BitmapRendererSection` would then list two entries with the same React key.

**Remediation:** reject reserved in-tree ids at discovery, with a discovery
error, or require plugin ids to be namespaced (e.g. contain a `.` or `/`).

### 12. Engine changes alter old documents without warning; plugin edits never re-render (Low)

**Where:** `bitmapImage.ts:128-140`

- **Engine changes:** the signature covers inputs but not renderer *code*.
  This branch's engine changes (tone-driven frequency, smoothing, bilinear
  sampling, piecewise drawing) leave saved documents showing the old geometry
  until any setting is touched, at which point the whole look jumps. Several
  comments ("preserves today's output for existing saved renders") are no
  longer true for the engine as a whole.
- **Plugin edits:** an edited plugin is rescanned and its warm host dropped,
  but existing imports keep the old output because the signature is
  unchanged.

**Remediation:**
- Add a `version` to `BitmapRendererDefinition` (and an optional `version` to
  the plugin manifest; failing that, a content hash of the plugin's entry
  module) and include it in the signature.
- Decide policy explicitly: re-render on open (geometry changes silently) or
  keep the old output and show a "renderer updated — re-render?" prompt. The
  prompt is safer for a plotting tool.

### 13. Inconsistencies and stale labels (Low)

- **Amplitude key:** spiral uses `amplitude`, every other tone-spine renderer
  uses `amplitudeMM`, so switching renderers loses the value and the keys
  can't be shared. Migrate spiral to `amplitudeMM`, with a load-time
  migration for saved files.
- **Stale aria label:** `spiralAmplitude.ts:162` still has
  `ariaLabel: "Sawtooth width"` now that the waveform is selectable.
- **"Tooth width" no longer matches:** with `FREQUENCY_GAIN = 2`, a black
  region's tooth is ⅓ of the set width. Rename the field (e.g. "Base tooth
  width"), or expose the gain as a "Tone → frequency" setting with 0 meaning
  fixed width.
- **Spacing only holds on one axis:**
  - Concentric boxes honour `spacingMM` on the x axis only; y spacing is
    multiplied by the aspect ratio, so a 1:3 portrait gets 3× gaps
    vertically.
  - Polygon spacing is circumradius spacing, so the edge-to-edge gap is
    `spacing·cos(π/n)`, half the setting for triangles.

  Either fix these or say so in the field help.
- **Radial burst centre:** every ray converges on the origin, piling ink at
  the centre and wearing the pen there. Add an inner-radius setting.

### 14. Resource limits on decode (Low)

**Where:** `bitmapImage.ts:36-72`, `useImportActions.ts:425-449`

- **No dimension cap:** a 12k×12k photo is a 576 MB RGBA readback plus a
  144 MB luminance array, on the UI thread. Renderers never need more than a
  few px per mm of output, so downsample on decode to a cap derived from the
  physical size (e.g. ≤ 10 px/mm).
- **Double decode on import:** the image is decoded once into an
  `HTMLImageElement` for its size, then again by `decodeToImageData`. Have
  the decode return its dimensions and reuse it.
- **Luminance not cached:** it is recomputed (and reallocated) on every
  render, although only settings changed. Cache it alongside the `ImageData`,
  which would also make the `toneRangeOf` WeakMap cache effective across
  renders instead of only within one.
- **Import ignores `paths`:** `useImportActions.ts:449` keeps only
  `bitmapRendererPath`. That's correct while the default is spiral, but it
  silently drops geometry if the default renderer ever becomes a dot or
  multi-layer renderer. Use both fields from the result.

### 15. Colour separation semantics (Low — confirm intent)

- **RGB mode:** density is taken from the channel value itself, so *white*
  gets full red + green + blue ink and black gets none. That's correct only
  for light inks on black paper. If it's meant for white paper, it's
  inverted. Confirm, then document or fix.
- **Auto levels:** `autoLevels` is computed per channel under separation,
  which rebalances the inks against each other. That's probably undesirable
  for CMYK. Tone preprocessing at the source level (A3) lets this be decided
  once.

### 16. Test gaps

There are no tests for any of issues 1–5 or 10. The existing suites pin
current behaviour closely (exact strings in some places), so the fixes above
will need some expectations updated. Prefer property-style assertions over
golden strings, for example:
- the first point equals the start of the base;
- no point lies beyond the image by more than the amplitude;
- the output contains no `NaN`.

---

## Part 2 — Architecture and simplification

### A1. Collapse the seven tone-spine renderers into one factory

`spiralAmplitude`, `circularRings`, `rasterLines`, `isometricGrid`,
`concentricBoxes`, `concentricPolygons` and `radialBurst` are 100–175 lines
each, and roughly 70 % of each is identical:
- the imports block,
- the defaults object,
- the twelve-line settings-parsing block,
- the field list,
- the `renderToneSpine` call.

The `maxRadius` four-corner computation is copied four times, and `format()`
is copied twice.

Proposed shape:

```ts
// toneSpine/defineToneSpineRenderer.ts
export function defineToneSpineRenderer(spec: {
  id: string;
  label: string;
  spacingLabel?: string;            // omit for renderers without spacing (burst)
  defaults?: Partial<BitmapRendererSettings>;   // overrides of the shared defaults
  extraFields?: BitmapRendererFieldSchema[];    // e.g. sides, rayCount
  strands(geometry: SpineGeometry, settings: CoercedSettings): Iterable<SpineStrand>;
}): BitmapRendererDefinition
```

`SpineGeometry` carries the already-converted pixel values (`spacing`,
`targetSegmentLength`, `origin`, `angleRad`, `width`, `height`,
`maxRadiusToCorner`). Each renderer file shrinks to its strand generator plus
about ten lines of spec. With `coerceSettings` (issue 5) handling clamping, no
renderer parses settings at all.

A new tone-spine renderer becomes a single generator function, which matters
given the planned generative direction.

### A2. One execution path for in-tree and plugin renderers

In-tree renderers run synchronously on the renderer's main thread. A large
spiral or ring render freezes the UI. The panel works around this with
`delay(0)` yields and a minimum visible status time, and colour separation's
`Promise.all` gains no parallelism. Plugins run in a worker but take a
different, async code path.

Proposed approach: run in-tree renderers in a renderer-process Web Worker
behind the same `render(context) → Promise<RendererOutput>` interface. In
practice that means a small worker pool, with transferable `Uint8Array`
sources. Benefits:
- The UI never blocks.
- Separation channels render in parallel.
- A superseded render can be cancelled by terminating or ignoring it.
- "Is this sync or async" disappears from `BitmapRendererDefinition.render`.

The panel's timing workarounds can then be simplified.

### A3. Move tone shaping out of the engine into a source preprocessing stage

`autoLevels`, `contrast` and smoothing are implemented inside the tone-spine
engine, so:
- halftone and every plugin miss out on them,
- `toneRangeOf` needs a cache,
- the engine options have grown to eight fields.

Proposed approach: apply a `prepareSource(source, toneSettings)` step in
`materializeBitmapLayers`, before any renderer runs. It covers levels (with
percentile clipping, e.g. 0.5 % / 99.5 %, rather than raw min/max, so one
stray pixel can't defeat it), contrast/gamma, invert, and the blur from
issue 7. These become *app-level* fields shown for every renderer, alongside
separation. The engine goes back to "sample tone → displace", and plugins get
the controls free.

### A4. Make rendering a service rather than a panel side effect

This is the structural fix for issue 1, and it also gives one place to do the
following:
- coalesce and cancel superseded renders (today, plugin renders queue
  serially in the host, and a stale one still runs to completion);
- handle renderer-version invalidation (issue 12);
- check for stale output before G-code generation;
- render imports that are not selected (e.g. after undo, or re-render on
  open).

The panel becomes a pure view of the status the service exposes.

### A5. Give `render()` a structured result

A bare `string | RendererLayer[]` result leaves no room for:
- warnings (truncation, issue 8),
- statistics (point count, estimated plot time),
- a structured dot list (instead of splitting a path string back apart with a
  regex — issue 10).

A non-breaking extension: also accept
`{ layers: RendererLayer[]; warnings?: string[]; dots?: {cx, cy, d}[] }`,
version-gated through `apiVersion: 2`, so v1 plugins keep working. Producing
dots as data also removes the "`producesDots` renderers must emit only
`M…L…Z`" constraint.

Longer term, consider returning numeric polylines (`Float32Array` per
strand) rather than formatted path strings. Formatting to 2 dp and then
re-parsing downstream (dot splitting, G-code, hatch fill) is the dominant
cost on big renders, and it loses precision on small scales.

### A6. Smaller tidy-ups

- `BitmapRendererDefinition` has no `source` field, so in-tree and plugin
  renderers describe themselves differently. Add it (all current in-tree
  ones are `"required"`), and filter the dropdown on the definition rather
  than on manifests only.
- `pluginRendererFromManifest` allocates a new definition object on every
  `findBitmapRenderer` call, which happens on every panel render. Memoise
  per manifest (e.g. a `WeakMap<BitmapPluginManifest, Definition>`).
- `types.ts` re-exports shared types "so existing imports don't change".
  Once A1 lands most of those imports are gone, so import from
  `src/types` directly and delete the re-export layer.
- `spiralAmplitude.ts` re-exports `bipolarToothPulse`/`luminanceAt` only for
  older tests. Point the tests at `toneSpine/*` and drop the re-exports.

---

## Suggested order

1. **Correctness first**, small and independently shippable:
   - issue 2 (`producesDots` passthrough),
   - issue 3 (strand start),
   - issue 4 (`clipToImage` semantics),
   - issue 5 (`coerceSettings`),
   - issue 9's `sqrt` fix,

   each with the tests listed above.
2. **Rendering service and G-code staleness guard** (issue 1 / A4), with the
   renderer `version` in the signature (issue 12).
3. **Tone preprocessing stage** (A3), which also resolves issue 7 and the
   halftone tone-control gap.
4. **Tone-spine renderer factory** (A1). Doing it after 1 and 3 means it
   absorbs those changes once instead of seven times.
5. **Worker execution for in-tree renderers** (A2) and the **structured
   result** (A5), together with any `apiVersion: 2` work. These are the
   largest changes, and the ones most worth doing before the plugin API gets
   third-party users.
