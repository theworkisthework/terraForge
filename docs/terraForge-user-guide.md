# terraForge — User Guide

> **Version:** 1.0 · **Date:** 2026-02-28
> This guide covers all currently implemented features of terraForge.

---

## Table of Contents

1. [What is terraForge?](#1-what-is-terraforge)
2. [Application Layout](#2-application-layout)
3. [First-Time Setup — Machine Configuration](#3-first-time-setup--machine-configuration)
4. [Connecting to Your Machine](#4-connecting-to-your-machine)
5. [Importing SVG Files](#5-importing-svg-files)
6. [Working on the Canvas](#6-working-on-the-canvas)
7. [The Properties Panel](#7-the-properties-panel)
8. [Generating G-code](#8-generating-g-code)
9. [The File Browser](#9-the-file-browser)
10. [Running a Job](#10-running-a-job)
11. [Jog Controls](#11-jog-controls)
12. [Console & Alarm Handling](#12-console--alarm-handling)
13. [Background Tasks](#13-background-tasks)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What is terraForge?

terraForge is a desktop application for controlling FluidNC-based pen plotters — especially the **TerraPen**. It lets you:

- Import SVG artwork and position it on the machine bed
- Convert SVG paths to G-code, with optional path optimisation to minimise pen travel
- Preview G-code toolpaths on the canvas before plotting
- Upload files to and manage your machine's SD card
- Start, pause, resume, and abort jobs
- Jog the machine and send raw commands via the console

terraForge communicates with FluidNC over **Wi-Fi (WebSocket + HTTP REST)** or **USB serial**.

---

## 2. Application Layout

> 📸 **Screenshot:** Full application window showing all panels

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOOLBAR                                                                    │
│  [terraForge] [Machine ▼] [Connect]  [Import SVG] [Import G-code]          │
│              [Generate G-code ▾]   [Home] [Jog]          [● Connected] [⚙] │
├──────────────┬──────────────────────────────────────┬───────────────────────┤
│              │                                      │                       │
│  FILE        │         CANVAS                       │  PROPERTIES           │
│  BROWSER     │                                      │                       │
│              │   ┌────────────────────────┐         │  ▸ logo (3p)  👁  ✕   │
│  ▾ INTERNAL  │   │  bed grid              │    [+]  │    X: 10 mm           │
│  ▾ SDCARD    │   │                        │    [−]  │    Y: 20 mm           │
│              │   │   [SVG paths here]     │    [⊡]  │    W: 80 mm           │
│  /           │   │                        │         │    H: 60 mm           │
│  config.yaml │   │                        │         │    Scale: 1.000       │
│  logo.gcode  │   └────────────────────────┘         │                       │
│              │         ← bed ←             125%     │                       │
├──────────────┴──────────────────────────────────────┴───────────────────────┤
│  CONSOLE                                             │  JOB                 │
│  > [Idle] X:0.00 Y:0.00 Z:0.00           [Clear]   │  📄 logo.gcode        │
│  ok                                                  │  [▶ Start job]       │
│  > _                                    [Send]      │                       │
└─────────────────────────────────────────────────────┴───────────────────────┘
```

### Panel Summary

| Area             | Location         | Purpose                                              |
| ---------------- | ---------------- | ---------------------------------------------------- |
| **Toolbar**      | Top              | Connect, import, generate, home, jog, settings       |
| **File Browser** | Left (240 px)    | Browse FluidNC internal filesystem and SD card       |
| **Canvas**       | Centre           | Visualise the bed, SVG imports, and G-code toolpaths |
| **Properties**   | Right (256 px)   | Position, scale, and manage imported objects         |
| **Console**      | Bottom-left      | Real-time FluidNC output; send raw commands          |
| **Job**          | Bottom-right     | Start/pause/resume/abort; job progress bar           |
| **Toast stack**  | Canvas top-right | Background task progress and notifications           |

---

## 3. First-Time Setup — Machine Configuration

Before you can connect, you need to create at least one **machine configuration profile**.

### Opening the Settings Dialog

Click the **⚙** (gear) button at the far right of the toolbar.

> 📸 **Screenshot:** Settings button highlighted in toolbar

### Creating Your First Profile

> 📸 **Screenshot:** Machine Configurations dialog — empty state

1. Click **+ New** in the sidebar.
2. Fill in the **General** section:

   | Field               | Description                       | Example       |
   | ------------------- | --------------------------------- | ------------- |
   | **Name**            | Display name for this machine     | `TerraPen`    |
   | **Bed width (mm)**  | Plottable X range                 | `220`         |
   | **Bed height (mm)** | Plottable Y range                 | `200`         |
   | **Origin**          | Where the machine home is         | `Bottom-left` |
   | **Pen type**        | Controls the pen-up/down commands | `Solenoid`    |

3. **Origin options:**

   | Origin         | Description                                          |
   | -------------- | ---------------------------------------------------- |
   | `Bottom-left`  | (0,0) at bottom-left — most common FluidNC default   |
   | `Top-left`     | (0,0) at top-left — some laser spindle setups        |
   | `Bottom-right` | (0,0) at bottom-right                                |
   | `Top-right`    | (0,0) at top-right                                   |
   | `Center`       | (0,0) at centre; bed coordinates run from −½W to +½W |

4. **Pen type** automatically fills in sensible defaults for the pen commands:

   | Pen Type | Pen Up  | Pen Down |
   | -------- | ------- | -------- |
   | Solenoid | `M3S0`  | `M3S1`   |
   | Servo    | `G0Z15` | `G0Z0`   |
   | Stepper  | `G0Z15` | `G0Z0`   |

   Use the **⇕ Swap** button if your solenoid wiring is reversed. Use **↺ Reset** to restore type defaults after manual edits.

5. Fill in the **Connection** section (see connection details in §4).

6. Click **Save Changes**.

7. Click **Set as Active** to make this the working machine.

8. Click **Close**.

> 📸 **Screenshot:** Completed machine config form

### Managing Multiple Profiles

- **Copy** — duplicates the selected profile (useful for machines that share the same bed size but differ in connection type).
- **Del** — deletes the selected profile. Disabled while connected.
- **Drag handle (⠿)** — drag rows up/down to reorder the list.
- **↑ Export** — saves all profiles to a `.json` file for backup or sharing.
- **↓ Import** — merges profiles from a `.json` file; duplicates (by ID or name) are skipped.

> **Note:** You cannot edit the **active** profile while the machine is connected. A 🔒 banner appears and all fields become read-only. Non-active profiles can be edited at any time.

---

## 4. Connecting to Your Machine

### Wi-Fi Connection

1. Ensure your FluidNC controller is on the same network as your computer.
2. Select your machine profile from the **Machine** dropdown in the toolbar (disabled while connected).
3. In the Machine Config dialog's **Connection** section:
   - Set type to **Wi-Fi**
   - Enter the **Host / IP** (e.g. `fluidnc.local` or `192.168.1.50`)
   - Leave **HTTP port** as `80` unless your setup differs
   - **WS port override** — leave blank for FluidNC 4.x (auto-detected). Enter `81` only for older ESP3D-based firmware
4. Click **Connect** in the toolbar.

> 📸 **Screenshot:** Toolbar showing Connect button and spinner while connecting

The connection status indicator (top-right of toolbar) shows:

| Indicator                        | Meaning                                |
| -------------------------------- | -------------------------------------- |
| ⚫ Grey dot + "Offline"          | Not connected                          |
| 🟢 Green dot + "Connected"       | Connected, WebSocket live              |
| 🟡 Amber pulsing + "Connecting…" | Connected but WebSocket not yet active |

If connection fails, a red error toast appears with the error message.

### USB Serial Connection

1. Set the connection type to **USB** in the Machine Config dialog.
2. Select the serial port from the dropdown (auto-populated from available ports), or type the path manually (e.g. `COM3` on Windows, `/dev/ttyUSB0` on Linux).
3. The baud rate is fixed at **115200** (FluidNC standard).
4. Click **Connect**.

### Disconnecting

Click **Disconnect** in the toolbar. The machine selector and config editing are re-enabled immediately.

---

## 5. Importing SVG Files

### Supported Elements

terraForge converts these SVG elements to plottable paths at import time:

| Element      | Notes                                                       |
| ------------ | ----------------------------------------------------------- |
| `<path>`     | Full command set: M L H V C S Q T A Z (absolute + relative) |
| `<rect>`     | Rounded corners (`rx`/`ry`) supported                       |
| `<circle>`   |                                                             |
| `<ellipse>`  |                                                             |
| `<line>`     |                                                             |
| `<polyline>` |                                                             |
| `<polygon>`  | Auto-closed                                                 |

### How to Import

Click **Import SVG** in the toolbar. A file dialog opens filtered to `.svg` files. Select your file.

> 📸 **Screenshot:** Canvas after importing an SVG — shape visible on bed grid

terraForge:

1. Reads the SVG's physical size (`width`/`height` attributes with units: `mm`, `cm`, `in`, `pt`, `pc`, `px`). The import appears at **correct real-world scale** by default.
2. Resolves all `transform` attributes (including Inkscape layer matrices) and bakes them into absolute path coordinates.
3. Normalises path coordinates so the object's origin is at its top-left corner.
4. Displays the import at position (0, 0) on the bed (bottom-left corner).
5. Shows a toast notification on completion.

### Physical Size Handling

| SVG unit        | Conversion           |
| --------------- | -------------------- |
| `mm`            | Direct (exact)       |
| `cm`            | × 10                 |
| `in`            | × 25.4               |
| `pt`            | × 25.4 / 72          |
| `pc`            | × 25.4 / 6           |
| `px` / unitless | × 25.4 / 96 (96 DPI) |

If the SVG has no physical units, 1 SVG user unit = 1 mm.

---

## 6. Working on the Canvas

### Canvas Overview

> 📸 **Screenshot:** Canvas with SVG import selected, showing bounding box and handles

The canvas shows:

- **Bed grid** — 10 mm minor lines, 50 mm major lines
- **Origin marker** — red dot at (0, 0) in machine coordinates
- **Rulers** — X ruler (bottom edge for bottom-left origin, top edge for top-left), Y ruler (left edge); adaptive tick density; origin labelled in red
- **Imported objects** — shown in blue; selected object shown in brighter blue with a red dashed bounding box
- **G-code toolpath overlay** — rapids in dashed grey, cuts in solid blue

### Zoom and Pan

| Action                           | Effect                          |
| -------------------------------- | ------------------------------- |
| **Mouse wheel**                  | Zoom in / out centred on cursor |
| **Ctrl+Shift++**                 | Zoom in                         |
| **Ctrl+Shift+−**                 | Zoom out                        |
| **Middle-mouse drag**            | Pan                             |
| **Space + left-drag**            | Pan (Space-to-pan mode)         |
| **⊡ button** (canvas overlay)    | Fit bed to viewport (Ctrl+0)    |
| **+/− buttons** (canvas overlay) | Zoom in / out                   |

The **zoom % badge** (bottom-left of canvas) shows the current zoom level.

The **⊡ (fit to view)** button highlights red when the view is actively fitted. The bed re-fits automatically on window resize while in fitted mode.

> 📸 **Screenshot:** Canvas overlay controls (zoom buttons, fit button, zoom % badge)

### Moving an Object

Click and drag any part of an imported SVG to move it. The object is clamped so its far edge cannot leave the bed boundary.

> 📸 **Screenshot:** Object being dragged, showing clamping at bed edge

### Scaling an Object

Click an object to select it. Eight **circular handles** appear at the corners and midpoints of the bounding box. Drag any handle to scale uniformly. Scaling is clamped to the bed boundary.

> 📸 **Screenshot:** Selected object with scale handles visible

Cursor changes match the handle position:

| Handle                   | Cursor            |
| ------------------------ | ----------------- |
| Corners (tl, tr, bl, br) | Diagonal resize   |
| Midpoints (t, b)         | Vertical resize   |
| Midpoints (l, r)         | Horizontal resize |

### Deleting an Object

Select the object and press **Delete** or **Backspace**, or click the **✕** button that appears near the top-right corner of the selected object's bounding box.

### Deselecting

Press **Escape**, or click an empty area of the canvas.

### G-code Toolpath on Canvas

When a G-code file is loaded for preview (from the File Browser or Import G-code):

- **Grey dashed lines** = rapid moves (pen up)
- **Blue solid lines** = cut moves (pen down)

Click the toolpath to select it. A blue dashed bounding box appears. Press **Delete** or click the **✕** button on the toolpath to remove the preview.

---

## 7. The Properties Panel

The Properties panel (right side) lists all imported SVG objects.

> 📸 **Screenshot:** Properties panel showing one expanded import with path list

### Import Row

Each import shows:

- **▸ / ▾** — expand/collapse the path list
- **👁 / ○** — toggle visibility (hidden imports are excluded from G-code)
- **Name** — double-click to rename inline (Enter to confirm, Escape to cancel). The name is used as the G-code save filename.
- **Np** — path count
- **✕** — delete the entire import

### Numeric Fields (when selected)

Click an import row to select it and reveal the numeric editors:

| Field      | Description                                                            |
| ---------- | ---------------------------------------------------------------------- |
| **X (mm)** | Horizontal position of the import's left edge                          |
| **Y (mm)** | Vertical position of the import's bottom edge                          |
| **W (mm)** | Width in mm; changing width recalculates scale (aspect ratio locked)   |
| **H (mm)** | Height in mm; changing height recalculates scale (aspect ratio locked) |
| **Scale**  | Uniform scale factor (1 = 100%)                                        |

All fields clamp to the bed boundary automatically.

> 📸 **Screenshot:** Properties panel with numeric fields visible for a selected import

### Per-Path Controls

Expand an import (▸) to see its individual paths. For each path:

- **👁 / ○** — show/hide the path. Hidden paths are excluded from G-code.
- **Name** — layer/group id from the SVG, or a short UUID
- **✕** — remove only this path from the import

---

## 8. Generating G-code

### Standard Generation

1. Import one or more SVGs and position them on the bed.
2. Click **Generate G-code** in the toolbar (red button, centre).
3. A progress toast appears in the top-right of the canvas.

> 📸 **Screenshot:** Generate G-code button and dropdown caret

**If connected to the machine:** The G-code is uploaded directly to the SD card root. The uploaded file is automatically selected as the queued job — **Start job** is immediately ready.

**If not connected:** A native save dialog opens. The default filename is derived from the import name(s):

- Single import: `logo.gcode`
- Multiple imports: `logo+2.gcode` (first name + count of others)

### Path-Optimised Generation

Click the **▾** caret on the right side of the Generate G-code button to reveal **Generate & optimise**.

> 📸 **Screenshot:** Split-button dropdown showing "Generate & optimise"

The optimiser:

1. Collects all visible sub-paths from all imports into a single pool.
2. Reorders them greedily (nearest-neighbour from the current pen position, starting at 0,0) to minimise total rapid travel distance.
3. Outputs a flat sequence — no per-object grouping.

Optimised filenames append `_opt`:

- `logo_opt.gcode`
- `logo+2_opt.gcode`

### G-code Header

Every generated file includes a header comment with:

- Machine name and bed dimensions
- Origin setting
- Whether path optimisation was applied
- Generation timestamp

### Cancelling Generation

While generation is running, a progress toast appears. Click the **✕** on the toast to cancel. The worker stops immediately and the toast changes to "G-code cancelled."

---

## 9. The File Browser

The left panel contains two collapsible sections: **INTERNAL** (FluidNC internal flash) and **SDCARD** (SD card).

> 📸 **Screenshot:** File Browser showing both sections, SDCARD expanded with files

### Navigation

- **Click a folder** to enter it.
- **↑ button** — go up one directory level.
- **Breadcrumb links** — click any segment to jump directly to that path.
- **↻ button** — refresh the current directory listing.

### File Operations

For each file in the listing:

| Control                      | Action                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| **Click file row**           | Select as queued job (highlighted blue); click again to deselect |
| **▶ button**                 | Run the file on the machine immediately                          |
| **🔍 button** (G-code files) | Load toolpath preview onto the canvas                            |
| **↓ button**                 | Download file to local disk                                      |
| **✕ button**                 | Delete file from the machine                                     |

> 📸 **Screenshot:** File row with action buttons

**Download dialogs:**

- `.gcode` / `.nc` / `.g` / `.gc` / `.gco` / `.ngc` / `.ncc` / `.cnc` / `.tap` → filtered save dialog
- All other file types → unfiltered save dialog

### Uploading Files

Click the **↑ Upload** button in a section header to open a native file dialog (unrestricted file types). The file is uploaded to the current directory. The listing refreshes automatically after upload.

Upload progress is shown in the toast stack. Uploads can be cancelled via the toast's ✕ button.

### Importing G-code from Your Computer

Click **Import G-code** in the toolbar. A dialog opens filtered to all recognised G-code extensions. The file is read from your local disk, parsed, and displayed as a toolpath overlay on the canvas. It is automatically queued as the job file (labelled 🖥 with "(local — will upload)"). When you click **Start job**, terraForge uploads it to the SD card root first, then runs it.

---

## 10. Running a Job

The **Job** section lives at the right side of the bottom panel.

> 📸 **Screenshot:** Job panel showing selected file and Start button

### Selecting a Job File

Pick a file in the File Browser (click its row to highlight it blue). The Job panel shows the filename.

Accepted extensions: `.gcode` `.nc` `.g` `.gc` `.gco` `.ngc` `.ncc` `.cnc` `.tap`

A warning appears if the selected file is not a recognised G-code extension.

### Starting a Job

Click **▶ Start job**. Button is disabled unless a valid G-code file is selected and the machine is connected.

- **SD card file** — runs immediately via the FluidNC `/run` endpoint.
- **Local file (🖥)** — uploads to the SD card root first, then runs. Upload progress is shown in the toast stack.

### During a Job

> 📸 **Screenshot:** Job panel during a running job with progress bar

| Control      | Action                                                     |
| ------------ | ---------------------------------------------------------- |
| **⏸ Pause**  | Sends FluidNC hold command                                 |
| **▶ Resume** | Sends FluidNC resume command (visible only when paused)    |
| **✕ Abort**  | Prompts for confirmation, then sends FluidNC abort command |

**Progress bar:**

- Shows `line N / total (%)` when FluidNC reports line numbers.
- Shows an indeterminate animation when line count is not yet available.
- Labels show **Running** or **Paused** state.

### After a Job

The progress bar disappears. The machine returns to **Idle** state (visible in the console header). The file remains selected so you can re-run without re-selecting.

---

## 11. Jog Controls

Click **Jog** in the toolbar to open the jog panel. The panel floats as an overlay and can be **dragged anywhere on screen** by its grey drag handle at the top.

> 📸 **Screenshot:** Floating jog panel

### Step Size

Select a step increment: **0.1 / 1 / 10 / 100** mm. The active step is highlighted red.

### XY Jogging

```
      [ ▲ Y+ ]
[ ◄ X- ] [ ⌂ ] [ X+ ► ]
      [ Y- ▼ ]
```

- **▲▼◄►** — jog the corresponding axis by the selected step.
- **⌂** — rapid move to origin (G0 X0 Y0).

### Z Jogging

**Z+** and **Z-** buttons jog the Z axis by the selected step.

### Feedrate

The **Feedrate mm/min** input controls the speed for all jog moves. Default is 3000 mm/min.

### Closing the Jog Panel

Click the **✕** on the panel, or click **Jog** again in the toolbar.

---

## 12. Console & Alarm Handling

The console occupies the left portion of the bottom panel.

> 📸 **Screenshot:** Console panel showing output and command input

### Output Log

All messages from FluidNC arrive here in real time:

- WebSocket console output (includes `ok`, `error`, status reports)
- Serial data (same stream behaviour)
- Commands echoed as `> command`
- terraForge system messages in `[terraForge] …` format

### Sending Commands

Type any raw G-code or FluidNC command in the input field at the bottom and press **Enter** or click **Send**. Disabled when not connected.

### Status Indicator

The console header shows:

- **Machine state** badge (`Idle`, `Run`, `Hold`, `Alarm`, etc.)
- **Position** `X:0.00 Y:0.00 Z:0.00` (work coordinates)

### Alarm Handling

When the machine enters **Alarm** state, the state badge becomes a pulsing red button:

> **⚠ ALARM — click to unlock**

Click it to send `$X` (alarm clear / unlock). Use this after homing errors, limit-switch trips, or soft-limit violations.

> 📸 **Screenshot:** Console header with pulsing ALARM button

### Firmware Restart

The **⚠ Restart FW** button appears in the console header when connected. Use this only when the controller is stuck (e.g. frozen, unresponsive to commands):

1. Click **⚠ Restart FW**.
2. Confirm the dialog. terraForge sends `[ESP444]RESTART`, which reboots the ESP32.
3. The connection drops immediately. terraForge auto-disconnects.
4. Wait for the controller to finish booting (~5 seconds), then click **Connect**.

> ⚠️ **Note:** This is a hard reboot. Any running job will be aborted.

### Homing

Click **Home** in the toolbar (disabled when not connected) to send `$H` and run the FluidNC homing cycle. The machine moves to its home switches. Make sure the bed is clear before homing.

### Clear Console

Click **Clear** in the console header to wipe the output log.

---

## 13. Background Tasks

All long-running operations appear as **toast notifications** stacked in the top-right corner of the canvas.

> 📸 **Screenshot:** Toast stack with one running task and one completed task

### Toast Anatomy

```
┌─────────────────────────────────┐
│ [▓▓▓░░░] 45%  Generating G-code │ ✕ │
└─────────────────────────────────┘
```

| Element              | Description                                        |
| -------------------- | -------------------------------------------------- |
| **Spinner**          | Shown when progress % is unknown (indeterminate)   |
| **Progress bar + %** | Shown when progress is measurable                  |
| **✓ green**          | Task completed successfully                        |
| **✕ red**            | Task cancelled by user                             |
| **! red**            | Task failed — error detail shown on a second line  |
| **✕ button**         | Cancel a running task, or dismiss a finished toast |

### Auto-dismiss

| Status    | Behaviour                                                          |
| --------- | ------------------------------------------------------------------ |
| Completed | Auto-dismissed after **8 seconds**                                 |
| Cancelled | Auto-dismissed after **8 seconds**                                 |
| Error     | **Never** auto-dismissed; must be manually dismissed by clicking ✕ |

### Cancellable Tasks

| Task              | Cancel mechanism                       |
| ----------------- | -------------------------------------- |
| G-code generation | Direct message to Web Worker (instant) |
| File upload       | IPC cancel via main process            |
| File download     | IPC cancel via main process            |

---

## 14. Keyboard Shortcuts

| Shortcut               | Action                             |
| ---------------------- | ---------------------------------- |
| `Space` (hold)         | Enter pan mode; drag to pan        |
| Middle-mouse drag      | Pan canvas                         |
| Mouse wheel            | Zoom canvas (centred on cursor)    |
| `Ctrl`+`Shift`+`+`     | Zoom in                            |
| `Ctrl`+`Shift`+`-`     | Zoom out                           |
| `Ctrl`+`0`             | Fit bed to viewport                |
| `Delete` / `Backspace` | Delete selected import or toolpath |
| `Escape`               | Deselect everything                |

> **Note:** Shortcuts are inactive when the cursor is in a text input.

---

## 15. Troubleshooting

### Connection Issues

**"Connection failed" toast:**

- Check that the FluidNC controller is powered and on the same Wi-Fi network.
- Try using the IP address instead of `fluidnc.local` (mDNS can be unreliable on some networks).
- For USB: check the serial port path; on Windows check Device Manager.

**Amber pulsing dot after connecting:**

- The HTTP connection succeeded but the WebSocket is not yet active.
- If it stays amber for more than 15 seconds, the WebSocket ping watchdog marks the connection dead.
- Try disconnecting and reconnecting. If the issue persists, check if your FluidNC firmware requires an explicit WebSocket port (`81` for older ESP3D builds).

**Machine goes offline mid-job:**

- terraForge detects the WebSocket drop after 15 seconds of no ping.
- There is currently no auto-reconnect; you must click **Disconnect**, then **Connect** again.

---

### SVG Import Issues

**"No paths found in SVG":**

- The SVG contains only `<text>`, `<image>`, `<use>`, or other non-geometric elements.
- Export your file from Inkscape/Illustrator with paths only ("Object to Path" in Inkscape).

**Import appears at wrong scale:**

- Your SVG uses `px`/unitless dimensions. terraForge assumes 96 DPI. If your source app uses a different DPI, add explicit `mm` units to the SVG `width`/`height` attributes.

**Paths are in the wrong position after import:**

- The SVG may use `transform` attributes that aren't being resolved correctly.
- Please report the file as a bug. terraForge resolves `translate`, `scale`, `rotate`, and `matrix` transforms on all ancestor elements.

---

### G-code Issues

**G-code generated but machine movement is offset:**

- Check that the **Origin** setting in your machine config matches your actual FluidNC configuration.
- Verify the **bed width/height** settings match the machine's travel.

**Pen not lifting between strokes:**

- Check your **pen type** and **pen up/down commands** in the machine config.
- For solenoids: try swapping up/down with the ⇕ Swap button.

**Very long rapids between strokes:**

- Use **Generate & optimise** to apply nearest-neighbour path reordering, which significantly reduces total rapid travel.

---

### Job Issues

**"Start job" button is greyed out:**

- Ensure the machine is connected.
- Ensure a G-code file is selected (highlighted blue) in the File Browser, or imported via Import G-code.

**Job stops unexpectedly with ALARM:**

- The machine has hit a soft or hard limit.
- Click the **⚠ ALARM — click to unlock** button in the console to send `$X`.
- Jog back to a safe position before re-running.

**File upload fails at start of local job:**

- The SD card may be full or not inserted.
- Check SD card status in the File Browser SDCARD section.

---

### Console Issues

**Console shows no output after connecting:**

- For Wi-Fi connections, console output arrives via WebSocket. If the WebSocket is still connecting (amber dot), wait a moment.
- Try sending a command (e.g. `?` for status) to prompt a response.

**Commands sent but no response:**

- Ensure the machine is not in **Alarm** state.
- Try clearing the alarm with `$X`, then resend.

---

_For bugs and feature requests, refer to the terraForge project repository._
