# Renderer plugins — state and follow-up plan

Working notes for the renderer plugin subsystem: what exists, what is
deliberately deferred, and why. Unlike `future-features.md`, this *is* context
for current work.

## Where we are

Renderer plugins are user-installed folders that turn inputs into plottable
geometry. They run in a hidden, sandboxed `BrowserWindow` with their code in a
Worker — no Node, no filesystem, no network (verified against live local HTTP
and WebSocket listeners: nothing reached either). The main process reads the
plugin's source itself and posts it in as data; the plugin never touches disk.

Settled and shipped:

- **Contract.** `render(context)` taking one object — `width`, `height`,
  `scale`, `settings`, and an **optional** `source`. Returns a path string, or
  an array of `{ d, label?, color? }` layers to drive several pens.
- **Manifests** declare `source` as `"required"` / `"optional"` / `"none"`, so
  the app knows without executing anything which renderers need an image.
- **Validation** of every manifest field before a plugin loads, and of output
  before it enters the document, with an error boundary behind that.
- **Lifecycle**: load timeout, per-render timeout, serial dispatch so a
  colour separation cannot time itself out, worker restart on hang, idle
  recycling, rescan dropping warm hosts.
- **Plugins live in** `userData/renderer-plugins`. Discovery errors surface in
  Application Configuration, which also offers Rescan, Open folder, and
  Install examples.
- **Examples** in `examples/plugins/`, shipped in the build, installable in one
  click, and executed by tests through the same CommonJS loader the sandbox
  uses so they cannot drift from the contract.

## Immediate — before publishing authoring docs

Nothing. The changes that would break third-party plugins are done; publishing
docs is what creates the compatibility obligation, so they were taken first.

## Follow-ups, in the order I would take them

### 1. Draw the bitmap preview on the canvas

The single highest-value item. Bitmap previews render as `<path d>` in **SVG
DOM** via `ImportLayer` / `CanvasSvgContent`, while every other piece of
geometry draws on the canvas with a `Path2D` cache and, for toolpaths, a
zoom-aware level-of-detail pass (`LOD_PX = 0.4`, skipping segments below
0.4 CSS px on screen).

That makes the bitmap preview the only geometry bypassing both. It explains
three symptoms already worked around rather than fixed:

- the canvas stuttering while a large path paints,
- number-spinner input feeling stuck during a render,
- the render status label needing a deliberate hold to be legible.

Moving it onto the canvas renderer inherits caching and decimation for free,
and answers the "is the cost render or paint?" question by removing the paint
cost. Do this before deciding anything else on performance grounds.

### 2. Fix `tsconfig.web.json`

`npm run typecheck` does not check the renderer at all. `tsconfig.json` is
`"files": []` plus project references, which compiles nothing without
`--build`, and its second project covers only main/preload/machine/tasks/types.

The web project has **167 errors** and its path aliases point at `./app/...`,
a directory that does not exist. This is not cosmetic: it hid four files whose
type-only imports resolved to a non-existent path, which esbuild erases
without checking, so neither the build nor the test suite could catch them.
Those files were effectively untyped. Fixing the config will surface real
errors that need working through.

### 3. Generators

The contract already supports them; the app has nowhere to put one.

- `kind: "generator"` alongside `"svg"` / `"bitmap"` on the positioned-object
  model, inheriting position, scale, rotation, visibility, layer and colour
  grouping, alignment, and G-code projection.
- A creation flow mirroring Import: a button makes a region of default size,
  the generator is chosen in the properties panel afterwards.
- **Resize regenerates** rather than scaling, so mm-denominated settings keep
  meaning millimetres. Use `snapshotForGesture` / `commitGesture`: scale the
  existing geometry during the drag for feedback, regenerate on release.
- Include the region extent in the render signature so a resize invalidates.
- Output units are millimetres with `scale: 1`; bitmaps keep pixels.
- Filter the renderer picker by `source` in both directions.
- Remove the install hold-back in `installExamplePlugins` — the spirograph
  example is already shipped and starts installing on its own.

Not constrained to the page template: page size is at most a default for a new
region, never a limit.

### 4. Internal naming pass

`BitmapPluginManifest`, `bitmapPlugins:*` IPC channels, the `bitmap-renderers`
feature directory, `BitmapPluginsSection`, `MAX_BITMAP_RENDERER_PATH_LENGTH`,
`resolveBitmapPluginsDir`. None of it is plugin-facing, so none of it breaks
anything — pure readability, and best done in one pass rather than drifting.

### 5. Decide whether in-tree renderers become plugins

Attractive for one code path and for dogfooding the contract, but it makes the
default renderer's availability depend on packaging, needs somewhere for
bundled plugins to live, and loses direct TypeScript unit tests unless the
source stays in-tree and is built into a plugin. Revisit **after** item 1,
since the performance argument for it may evaporate entirely.

### 6. Smaller additive items

None of these break existing plugins, so they can land whenever.

- **Seed in the context.** Generative work wants controlled variation, and the
  render signature means a non-deterministic plugin renders once and sticks. A
  host-provided seed gives a uniform "new variation" affordance instead of
  every plugin inventing its own setting.
- **Progress reporting** for slow renders.
- **More field types** — colour, free text — and array-valued settings, which
  would let a custom palette live in the settings bag rather than as the
  special case `bitmapSeparationPalette` is today.
- **Halve the input copies** by brokering a `MessagePort` between renderer and
  sandbox, removing the main-process hop. Only worth it if measurement says
  so: the remaining hop measured 19ms for an 11MB payload.

## Sizing decisions, for the record

Output is capped at **64MB** of path data. Sized from measurement, not
intuition: a renderer anchoring detail to the pen (0.1mm, below which nothing
reaches paper) produces output proportional to the drawing rather than to any
source image — about 3.4 million points and 46MB for a metre-wide plot at 1mm
line spacing. That is legitimate work, and an earlier 16MB ceiling rejected it.
What the cap still guards is memory: the finished path is cloned across
sandbox, host and renderer, so transient cost is a few times the number.
