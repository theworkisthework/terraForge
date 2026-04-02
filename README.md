# terraForge

Desktop control app for FluidNC-based pen plotters (TerraPen and compatible machines).

Import SVG and PDF artwork, position it on the machine bed, generate optimised G-code, and plot — all without leaving the app.

![Application screenshot](docs/resources/screen-shot.png)

---

## Features

### File Import

- **SVG** — full shape support (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`), physical unit detection (`mm`, `cm`, `in`, `pt`, `pc`, `px`), `transform` attribute resolution (including Inkscape layer matrices), and **sub-layer detection** — Inkscape-style `<g>` layers are imported as collapsible sub-layers in the Properties panel, preserving the original SVG visibility state with per-layer toggle controls
- **PDF** — vector path extraction from all pages; physical scale preserved (`25.4 ÷ 72 mm/pt`)
- **G-code** — import local `.gcode`/`.nc`/`.g` files for canvas preview and direct plotting

### Canvas

- Bed grid with 10 mm / 50 mm gridlines, origin marker, and rulers
- Move, scale (8-handle bounding box), and rotate imports; aspect-ratio lock
- Fit-to-bed and 1:1 scale shortcuts
- Zoom (scroll wheel, keyboard), pan (Space+drag, middle-mouse), fit-to-view
- Multi-select (Ctrl+A), undo/redo (50 steps), copy/paste
- Live plot progress overlay — completed cuts in red, rapids in orange
- Pen position crosshair tracking work coordinates in real time

### G-code Generation

- Runs in a Web Worker — UI never blocks
- Full path command support with Bézier and arc flattening
- **Nearest-neighbour path optimisation** — minimises total rapid travel
- **Path joining** (experimental) — merges near-touching strokes within a configurable tolerance
- Per-layer G-code output for multi-pen / multi-colour workflows
- Upload directly to machine SD card after generation, save to disk, or both
- Generation preferences persisted in `localStorage`

### Machine Connection

- **Wi-Fi** (WebSocket + HTTP REST to FluidNC)
- **USB serial** (115200 baud)
- Auto-reconnect with exponential back-off (3 s → 60 s cap)
- Real-time status: machine state, work position, firmware version
- Multiple named machine configuration profiles with import/export

### File Browser

- Browse FluidNC internal flash and SD card
- Upload, download, delete, run, and G-code-preview files
- Click a row to queue it as the next job

### Job Control

- Start, pause, resume, and abort jobs
- Progress bar with line number and percentage
- Local files auto-uploaded to SD before running

### Jog Controls

- Floating, draggable jog panel
- X/Y/Z axes, configurable step (0.1 / 1 / 10 / 100 mm) and feedrate
- Go-to-origin, homing (`$H`), and set-zero (`G10 L20 P1`)

### Other

- Console with real-time FluidNC output, command input, alarm clear (`$X`), and firmware restart
- Background task toasts (progress, cancel, errors)
- Layer groups for multi-pen workflows
- Page template overlays (A2–A6, Letter, Legal, Tabloid) with margin and page-clip support
- Save/open/close `.tforge` layout files
- Dark and light themes

---

## Requirements

- **Node.js** ≥ 24
- A built FluidNC controller reachable over Wi-Fi or USB

---

## Development

```sh
npm install
npm run dev          # Electron dev server with hot reload
npm run build        # Production build → out/
npm test             # Vitest unit + component tests
npm run test:e2e     # Playwright E2E (builds first)
npm run typecheck    # TypeScript strict check
```

### Distributable packages

```sh
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
npm run dist:all     # All three platforms
```

---

## Documentation

- [User Guide](docs/terraForge-user-guide.md) — full feature walkthrough with screenshots
- [Spec](docs/terraForge-spec.md) — architecture and IPC API reference
- [Feature Status](docs/terraForge-features.md) — implemented / in-progress / planned

---

## Tech Stack

| Layer         | Technology                   |
| ------------- | ---------------------------- |
| Shell         | Electron 40                  |
| UI            | React 19, TailwindCSS 4      |
| Build         | electron-vite 5, Vite 7      |
| State         | Zustand + Immer              |
| G-code engine | Web Worker (TypeScript)      |
| Machine comms | WebSocket (`ws`), SerialPort |
| PDF import    | pdfjs-dist                   |
| Tests         | Vitest, Playwright           |

---

## License

MIT
