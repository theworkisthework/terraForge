# Writing a renderer plugin

A renderer plugin turns inputs into plottable geometry. terraForge hands it an
area to fill, the settings you asked for, and — if you want one — the tones of
an imported image. You hand back SVG path data. terraForge does the rest:
placing it on the bed, grouping, clipping to the page, and generating G-code.

Your plugin runs in a sandbox with no filesystem, no network and no Node
APIs. It cannot damage anything or reach anything, so you can install one you
found on the internet without auditing it first.

## Quick start

Open **Machine Settings → Application Configuration → Renderer Plugins** and
press **Install examples**. That copies a worked plugin into your plugins
folder; **Open plugins folder** takes you to it. Read it, change something,
press **Rescan**, and your change is live.

The examples also live in `examples/plugins/` in the terraForge source:

- **`tonal-lines`** — parallel lines that wobble where the image is dark.
  A renderer that needs a source image.
- **`spirograph`** — a curve built from settings alone. A *generator*; see
  [Generators](#generators) for what that means today.

## Anatomy

A plugin is a folder in `renderer-plugins` inside terraForge's user data
directory:

```
renderer-plugins/
  my-renderer/
    manifest.json     required — describes your plugin and its controls
    index.js          required — the code, named by manifest.entry
    lib/helper.js     optional — more files, reached with require("./lib/helper")
```

Restart or press **Rescan** after adding a folder.

Limits on what terraForge will read: at most **64 files**, **2MB total**, and
**6 directories deep**. Only `.js` and `.json` files are loaded. `node_modules`
and dot-directories are skipped, and symlinks are ignored rather than followed.

## manifest.json

```json
{
  "id": "acme.halftone",
  "label": "Acme Halftone",
  "apiVersion": 1,
  "entry": "index.js",
  "source": "required",
  "renderTimeoutMs": 8000,
  "defaults": { "dotSizeMM": 1.2, "invert": false, "grid": "square" },
  "fields": [
    { "type": "number", "key": "dotSizeMM", "label": "Dot size (mm)", "min": 0.2, "max": 10, "step": 0.1 },
    { "type": "boolean", "key": "invert", "label": "Invert tones" },
    {
      "type": "select", "key": "grid", "label": "Grid",
      "options": [
        { "value": "square", "label": "Square" },
        { "value": "hex", "label": "Hexagonal" }
      ]
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique identifier. Saved with any drawing that uses your renderer, so **never change it** — an existing drawing referencing a missing id reports the renderer as uninstalled rather than silently substituting another. |
| `label` | yes | Name shown in the Renderer list. |
| `apiVersion` | yes | Currently `1`. |
| `entry` | yes | Your entry module, relative to the plugin folder. Must resolve inside it. |
| `source` | no | `"required"` (default), `"optional"` or `"none"` — see below. |
| `renderTimeoutMs` | no | Per-render budget. Defaults to 4000, clamped to 500–15000. |
| `defaults` | yes | A starting value for **every** field you declare, of the matching type. |
| `fields` | yes | The controls to show in the properties panel. May be empty. |

### `source`

Declares whether you need an image, so terraForge knows where to offer you
without running any of your code.

- `"required"` — a bitmap renderer. `context.source` is always present.
- `"none"` — a generator. `context.source` is never present.
- `"optional"` — a generator that uses an image to modulate itself when given
  one. Check whether `context.source` exists.

### Field types

Every field needs `type`, `key` and `label`, and a matching entry in
`defaults`. `ariaLabel` is optional everywhere and improves screen-reader
output. Keys must be unique.

**`number`** — requires finite `min`, `max` and `step`, with `min <= max` and
`step > 0`. Optional `control` of `"input"` (default) or `"slider"`. Optional
`presets`, each `{ label, delta, ariaLabel?, icon? }`, shown as nudge buttons
that add `delta` to the current value.

**`boolean`** — a checkbox. Nothing else to configure.

**`select`** — requires a non-empty `options` array of `{ value, label, icon? }`.
Optional `control` of `"dropdown"` (default) or `"icon-buttons"`. The matching
entry in `defaults` must be one of your own option values.

`icon` must be one of: `rotate-cw`, `rotate-ccw`, `arrow-left-right`,
`arrow-up-down`, `flip-horizontal`, `flip-vertical`. Anything else is rejected.

Manifests are validated before your code runs. A rejected plugin does not
appear in the Renderer list, and the reason is shown under **Renderer Plugins**
in Application Configuration — check there first if yours is missing.

## The render function

Export a single function:

```js
module.exports.render = function render(context) {
  return "M0 0 L10 10";
};
```

It may be `async` or return a promise.

### What you are given

```js
{
  width,    // width of the area to fill, in output units
  height,   // height of the area to fill, in output units
  scale,    // millimetres per output unit
  settings, // your fields, by key
  source,   // tones over the area — absent unless you asked for one
}
```

**Output units** are whatever space you return coordinates in. For a bitmap
renderer one output unit is one source pixel, so `width`/`height` match the
image and `scale` is millimetres per pixel. For a generator, coordinates are
millimetres and `scale` is `1`.

Because settings like "2mm spacing" are in millimetres, convert them:

```js
const unitsPerMM = 1 / scale;
const spacing = settings.spacingMM * unitsPerMM;
```

`source`, when present, is `{ width, height, values }` where `values` is a
`Uint8Array` of one byte per unit, row-major: **0 is black, 255 is white**.
Read it as `values[y * source.width + x]`, and treat anything outside the
image as white.

### What you return

Either a path string:

```js
return "M0 0 L10 10 L20 0";
```

or an array of layers, when one render should drive more than one pen:

```js
return [
  { d: "M0 0 L10 10", label: "Outline", color: "#1b6ac9" },
  { d: "M5 5 L15 15", label: "Shading", color: "#c9451b" },
];
```

Each layer becomes its own plottable layer, carrying its label and colour
through to the canvas and the G-code. `label` and `color` are optional.

Only characters valid in SVG path data are accepted. This is mostly a guard
against a bad number reaching the page: `"M" + NaN` produces `"MNaN"`, and
`Infinity`, `undefined` and `null` are equally visible. Any of them is
rejected with the position of the offending character.

## What the sandbox allows

- **CommonJS.** Use `module.exports` / `exports`. ES module syntax is not
  supported.
- **Relative `require` only** — `require("./lib/curve")` resolves against your
  own folder, with `.js`, `/index.js` and `.json` tried in turn. There are no
  node modules and no `node_modules` folder; bring what you need or write it.
- **No `fs`, no network, no `process`.** `require("fs")` throws, and `fetch`,
  `XMLHttpRequest`, `WebSocket`, `importScripts` and dynamic `import` are all
  blocked.
- **Plain computation only.** No DOM, no canvas.

### Be deterministic

The same context should produce the same output. terraForge fingerprints the
inputs and skips re-rendering when nothing has changed, so a renderer using
`Math.random()` will render once and appear stuck.

If you want variation, declare a `seed` number field and derive your randomness
from it. Then a new variation is a value the user can change, keep, and get
back later.

## Writing a well-behaved renderer

**Anchor detail to the pen, not to the image.** A pen cannot place anything
finer than about **0.1mm**. Sampling per source pixel makes your output grow
with the picture rather than with the drawing — the `tonal-lines` example
produced nearly 25MB that way from a 12-megapixel photo, almost all of it
detail that could never reach paper. Derive your sampling step and your
coordinate precision from `scale` instead:

```js
const PEN_RESOLUTION_MM = 0.1;
const penStep = PEN_RESOLUTION_MM / scale;                       // in output units
const decimals = Math.max(0, Math.ceil(Math.log10(scale / 0.05)));
commands.push("L" + x.toFixed(decimals) + " " + y.toFixed(decimals));
```

**Stay under the ceiling.** Output is capped at 64MB of path data, enforced
inside the sandbox. That is deliberately above what real work needs — a
metre-wide plot at 1mm line spacing is around 3.4 million points and 46MB — so
hitting it usually means detail finer than the pen, not a genuinely dense
drawing.

**Finish in time.** Exceeding `renderTimeoutMs` kills your worker and reports a
timeout. The user can nudge a slider repeatedly, so aim well under the budget
rather than at it.

## When things go wrong

Your plugin is isolated: a crash, hang or infinite loop affects only your
renderer, never terraForge or anyone else's plugin.

| Symptom | Where to look |
| --- | --- |
| Not in the Renderer list | **Renderer Plugins** in Application Configuration, which names the folder and the exact problem |
| "Render failed: …" under the controls | The message is whatever your `render` threw |
| "timed out after …" | Took longer than `renderTimeoutMs` |
| "returned invalid path data at character …" | A bad number reached your path string |
| Edits not taking effect | Press **Rescan** — source is read once and kept warm |

## Generators

The contract fully supports renderers that need no image: declare
`"source": "none"`, ignore `context.source`, and fill the `width` × `height`
area you are given.

**terraForge cannot yet place a generator on the bed.** There is no way to
create an object for one to draw into, so a generator will not appear anywhere
in the app, and the example installer deliberately holds the `spirograph`
example back. The contract is settled and stable — write against it if you
like — but the surface to use it is still to come.
