/**
 * generate-icons.ts
 *
 * Renders docs/resources/terraForge.svg into platform icon files:
 *   build/icon.png   — 512×512 PNG  (Linux + source for ICO/ICNS)
 *   build/icon.ico   — multi-res ICO (Windows: 16, 32, 48, 64, 128, 256 px)
 *   build/icon.icns  — multi-res ICNS (macOS: 16–1024 px)
 *
 * Icon style parameters (edit here to change the look):
 */

const STROKE_COLOR = "#ffffff"; // logo stroke colour
const STROKE_WIDTH = 6; // px on the 450×450 canvas (default is 3 — doubled for icon legibility)
const BG_COLOR = "#111111"; // slightly off-black so icon stands out from dark OS chrome
const CORNER_RADIUS = 90; // rx/ry on a 450×450 canvas (~20% = squircle)
const CANVAS_SIZE = 450;
const OUTPUT_SIZE = 512; // rendered PNG size

// Tight square crop centered on the logo content (content center ≈ 225,225).
// Side = 2×168 (tallest half-extent) + 8px breathing room each side.
const CROP = { x: 49, y: 49, w: 352, h: 352 };

// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";
import * as png2icons from "png2icons";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ── 1. Load and patch the SVG ─────────────────────────────────────────────────

const svgPath = join(root, "assets", "terraForge.svg");
let svg = readFileSync(svgPath, "utf-8");

// Replace black stroke with white and increase stroke width for small-size legibility
svg = svg.replace(/#000(?:000)?/g, STROKE_COLOR);
svg = svg.replace(
  /stroke-width:\s*[\d.]+px/,
  `stroke-width: ${STROKE_WIDTH}px`,
);

// Crop the viewBox tightly around the logo content
svg = svg.replace(
  /viewBox="[^"]*"/,
  `viewBox="${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}"`,
);

// Background rect covers the cropped viewport; corner radius scaled proportionally (20%)
const crCorner = Math.round(
  (CORNER_RADIUS / CANVAS_SIZE) * Math.min(CROP.w, CROP.h),
);
const bgRect = `<rect x="${CROP.x}" y="${CROP.y}" width="${CROP.w}" height="${CROP.h}" rx="${crCorner}" ry="${crCorner}" fill="${BG_COLOR}"/>`;
svg = svg.replace(/(<svg[^>]*>)/, `$1${bgRect}`);

// ── 2. Render to PNG ──────────────────────────────────────────────────────────

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: OUTPUT_SIZE },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

// ── 3. Write outputs ──────────────────────────────────────────────────────────

const buildDir = join(root, "build");
mkdirSync(buildDir, { recursive: true });

const pngPath = join(buildDir, "icon.png");
writeFileSync(pngPath, pngBuffer);
console.log(`✔ build/icon.png  (${OUTPUT_SIZE}×${OUTPUT_SIZE})`);

const icoBuffer = png2icons.createICO(pngBuffer, png2icons.BILINEAR, 0, true);
if (!icoBuffer) throw new Error("ICO generation failed");
writeFileSync(join(buildDir, "icon.ico"), icoBuffer);
console.log("✔ build/icon.ico");

const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BILINEAR, 0);
if (!icnsBuffer) throw new Error("ICNS generation failed");
writeFileSync(join(buildDir, "icon.icns"), icnsBuffer);
console.log("✔ build/icon.icns");

console.log("\nDone. Icons written to build/");
