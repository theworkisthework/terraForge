/**
 * PDF → SvgImport conversion utilities.
 *
 * Uses pdfjs-dist (Mozilla PDF.js) to extract vector paths from PDF pages
 * and converts them to the SvgImport/SvgPath model used by the rest of the
 * app, so routing through the existing G-code pipeline requires no changes.
 *
 * Coordinate system notes
 * ───────────────────────
 * PDF user-space has its origin at the bottom-left of the page, with Y
 * increasing upward.  SVG / screen space has origin at top-left with Y
 * increasing downward.  All Y values are flipped here:
 *   svgY = pageHeight − pdfY
 *
 * Scale
 * ─────
 * PDF coordinates are in "points" (1/72 inch).  The SvgImport.scale field
 * is set to PT_TO_MM (≈ 0.3528) so the G-code engine emits the correct
 * real-world dimensions automatically.
 */

import type { SvgPath, SvgImport } from "../../../types";
import { computePathsBounds, applyMatrixToPathD } from "./svgTransform";
import { v4 as uuid } from "uuid";

// 1 PDF point = 25.4 / 72 mm
const PT_TO_MM = 25.4 / 72;

// ─── PDF path operator codes ─────────────────────────────────────────────────
// These integer values are stable across pdfjs-dist 2.x – 4.x and match the
// OPS enum exported by the library.  Using them as constants keeps
// opsToSvgPaths() free of an async pdfjs import and therefore unit-testable.
export const PDF_OPS = {
  moveTo: 13,
  lineTo: 14,
  curveTo: 15, // full cubic bezier (6 args)
  curveTo2: 16, // p1 = current point (4 args: x2,y2,x3,y3)
  curveTo3: 17, // p2 = endpoint (4 args: x1,y1,x3,y3)
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closePathStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closePathFillStroke: 26,
  closePathEOFillStroke: 27,
  endPath: 28,
  constructPath: 91,
} as const;

// ─── pdfjs lazy loader ───────────────────────────────────────────────────────

type PdfjsLib = typeof import("pdfjs-dist");
let _pdfjs: PdfjsLib | null = null;

async function getPdfjsLib(): Promise<PdfjsLib> {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import("pdfjs-dist");
  // Configure pdfjs's internal worker.  Using new URL(..., import.meta.url)
  // lets Vite copy the worker file to the output directory and resolve the
  // correct URL in both dev and production Electron builds.
  _pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).href;
  return _pdfjs;
}

// ─── Path op → SVG path conversion ─────────────────────────────────────────

const fmt = (n: number) => +n.toFixed(4);

/**
 * Convert a sequence of PDF path operators + their packed coordinate args
 * into an array of SVG path `d` strings.  Each moveTo starts a new path.
 *
 * @param ops   Flat array of PDF_OPS values (from constructPath sub-array or
 *              an individually collected sequence).
 * @param args  Flat array of coordinate values corresponding to the operators.
 * @param pageHeight  Page height in PDF points — used for Y-axis flip.
 */
export function opsToSvgPaths(
  ops: ArrayLike<number>,
  args: ArrayLike<number>,
  pageHeight: number,
): string[] {
  const paths: string[] = [];
  let d = "";
  let ai = 0;
  let cx = 0;
  let cy = 0;
  const flipY = (y: number) => pageHeight - y;

  for (let i = 0; i < ops.length; i++) {
    switch (ops[i]) {
      case PDF_OPS.moveTo: {
        if (d) paths.push(d);
        const x = fmt(args[ai++]);
        const y = fmt(flipY(args[ai++]));
        d = `M${x},${y}`;
        cx = x;
        cy = y;
        break;
      }
      case PDF_OPS.lineTo: {
        const x = fmt(args[ai++]);
        const y = fmt(flipY(args[ai++]));
        d += ` L${x},${y}`;
        cx = x;
        cy = y;
        break;
      }
      case PDF_OPS.curveTo: {
        // Full cubic bezier — 6 args: x1 y1 x2 y2 x3 y3
        const x1 = fmt(args[ai++]),
          y1 = fmt(flipY(args[ai++]));
        const x2 = fmt(args[ai++]),
          y2 = fmt(flipY(args[ai++]));
        const x3 = fmt(args[ai++]),
          y3 = fmt(flipY(args[ai++]));
        d += ` C${x1},${y1},${x2},${y2},${x3},${y3}`;
        cx = x3;
        cy = y3;
        break;
      }
      case PDF_OPS.curveTo2: {
        // First control point = current position — 4 args: x2 y2 x3 y3
        const x2 = fmt(args[ai++]),
          y2 = fmt(flipY(args[ai++]));
        const x3 = fmt(args[ai++]),
          y3 = fmt(flipY(args[ai++]));
        d += ` C${cx},${cy},${x2},${y2},${x3},${y3}`;
        cx = x3;
        cy = y3;
        break;
      }
      case PDF_OPS.curveTo3: {
        // Second control point = endpoint — 4 args: x1 y1 x3 y3
        const x1 = fmt(args[ai++]),
          y1 = fmt(flipY(args[ai++]));
        const x3 = fmt(args[ai++]),
          y3 = fmt(flipY(args[ai++]));
        d += ` C${x1},${y1},${x3},${y3},${x3},${y3}`;
        cx = x3;
        cy = y3;
        break;
      }
      case PDF_OPS.closePath: {
        d += " Z";
        break;
      }
      case PDF_OPS.rectangle: {
        // PDF rect: x y w h — origin is bottom-left corner; h is positive upward.
        // 4 args: x y w h
        if (d) paths.push(d);
        const rx = fmt(args[ai++]);
        const ryRaw = args[ai++];
        const rw = fmt(args[ai++]);
        const rhRaw = args[ai++];
        // After Y-flip the bottom PDF edge becomes the larger SVG Y value.
        const top = fmt(flipY(ryRaw + rhRaw));
        const bot = fmt(flipY(ryRaw));
        d = `M${rx},${top} H${fmt(rx + rw)} V${bot} H${rx} Z`;
        paths.push(d);
        d = "";
        break;
      }
      default:
        break;
    }
  }

  if (d) paths.push(d);
  return paths.filter((p) => p.length > 1);
}

// ─── Per-page extraction via canvas proxy ───────────────────────────────────
//
// Rather than manually parsing the operator list and re-implementing pdfjs's
// coordinate transform logic, we let pdfjs render the page normally into an
// OffscreenCanvas and intercept every canvas path call.  Using
// `ctx.getTransform()` + `DOMPoint.matrixTransform()` at the intercept site
// gives us coordinates that are ALREADY in viewport space (i.e. after the
// viewport flip and any page-rotation matrix has been applied by pdfjs).
//
// This approach is robust against page rotation, non-origin media boxes, and
// any other PDF quirk because pdfjs resolves all of that before calling into
// the canvas API.

type Ctx2D = OffscreenCanvasRenderingContext2D;

/** Transform a PDF user-space point through the canvas's current CTM. */
function applyCtm(ctx: Ctx2D, x: number, y: number): [number, number] {
  const m = ctx.getTransform();
  const pt = new DOMPoint(x, y).matrixTransform(m);
  return [+pt.x.toFixed(4), +pt.y.toFixed(4)];
}

 
async function extractPagePaths(page: any): Promise<string[]> {
  const viewport = page.getViewport({ scale: 1 });

  const canvas = new OffscreenCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const ctx = canvas.getContext("2d") as Ctx2D;

  const collected: string[] = [];
  let d = ""; // current path accumulator (SVG d-string in viewport space)
  let emitted = false; // true once d has been committed for this path; prevents
  // double-collection when pdfjs calls fill() then stroke()

  // Commit the current accumulated path to collected[], if it holds real content.
  const commit = () => {
    const p = d.trim();
    if (!emitted && p.length > 1) {
      collected.push(p);
      emitted = true;
    }
  };

  // Proxy handler — intercepts path-building and painting calls:
  //
  //   • Path building ops (moveTo, lineTo, …) append to `d`.
  //   • stroke() / fill() call commit() — path is only collected here.
  //   • clip() discards `d` — clipping regions must NOT become drawn paths.
  //   • beginPath() resets state — pdfjs calls this after each paint op.
  //   • Everything else passes straight through so pdfjs internal state
  //     (transforms, styles, save/restore stack, …) stays correct.
  const handler: ProxyHandler<Ctx2D> = {
    get(target, prop: string | symbol) {
      const key = prop as string;

      // ── Path reset ──────────────────────────────────────────────────────
      if (key === "beginPath")
        return () => {
          d = "";
          emitted = false;
          target.beginPath();
        };

      // ── Path building ────────────────────────────────────────────────────
      if (key === "moveTo")
        return (x: number, y: number) => {
          const [tx, ty] = applyCtm(target as Ctx2D, x, y);
          d += d ? ` M${tx},${ty}` : `M${tx},${ty}`;
          target.moveTo(x, y);
        };

      if (key === "lineTo")
        return (x: number, y: number) => {
          const [tx, ty] = applyCtm(target as Ctx2D, x, y);
          d += ` L${tx},${ty}`;
          target.lineTo(x, y);
        };

      if (key === "bezierCurveTo")
        return (
          cp1x: number,
          cp1y: number,
          cp2x: number,
          cp2y: number,
          x: number,
          y: number,
        ) => {
          const [tx1, ty1] = applyCtm(target as Ctx2D, cp1x, cp1y);
          const [tx2, ty2] = applyCtm(target as Ctx2D, cp2x, cp2y);
          const [tx, ty] = applyCtm(target as Ctx2D, x, y);
          d += ` C${tx1},${ty1},${tx2},${ty2},${tx},${ty}`;
          target.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        };

      if (key === "quadraticCurveTo")
        return (cpx: number, cpy: number, x: number, y: number) => {
          const [txc, tyc] = applyCtm(target as Ctx2D, cpx, cpy);
          const [tx, ty] = applyCtm(target as Ctx2D, x, y);
          d += ` Q${txc},${tyc},${tx},${ty}`;
          target.quadraticCurveTo(cpx, cpy, x, y);
        };

      if (key === "closePath")
        return () => {
          d += " Z";
          target.closePath();
        };

      if (key === "rect")
        return (x: number, y: number, w: number, h: number) => {
          // rect() appends a closed sub-path to the current path.  It will be
          // emitted only if stroke() / fill() is later called — NOT for clip().
          const [tx1, ty1] = applyCtm(target as Ctx2D, x, y);
          const [tx2, ty2] = applyCtm(target as Ctx2D, x + w, y + h);
          const l = Math.min(tx1, tx2),
            r = Math.max(tx1, tx2);
          const t = Math.min(ty1, ty2),
            b = Math.max(ty1, ty2);
          d += (d ? " " : "") + `M${l},${t} H${r} V${b} H${l} Z`;
          target.rect(x, y, w, h);
        };

      // ── Painting — only here do we collect the path ─────────────────────
      if (
        key === "stroke" ||
        key === "fill" ||
        key === "strokeRect" ||
        key === "fillRect"
      )
        return (...args: unknown[]) => {
          commit();
          (target[key as keyof Ctx2D] as Function).apply(target, args);
        };

      // ── Clipping — discard; clip regions must NOT become drawn paths ─────
      if (key === "clip")
        return (...args: unknown[]) => {
          d = "";
          emitted = true; // prevent any subsequent spurious commit
          (target.clip as Function).apply(target, args);
        };

      // ── Everything else passes through unchanged ─────────────────────────
      const val = (target as Record<string, unknown>)[key];
      if (typeof val === "function") return (val as Function).bind(target);
      return val;
    },
    set(target, prop: string | symbol, value: unknown) {
      (target as Record<string, unknown>)[prop as string] = value;
      return true;
    },
  };

  const proxyCtx = new Proxy(ctx, handler);

  // Render the page — pdfjs applies the viewport transform (including Y-flip)
  // via ctx.transform() before drawing any paths, so all intercepted coords
  // are already in the correct screen / viewport coordinate space.
   
  await (page.render({ canvasContext: proxyCtx as any, viewport }) as any)
    .promise;

  // Collect any trailing path not followed by a final beginPath.
  commit();

  return collected;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a PDF file and return one `SvgImport` per page that contains vector
 * paths.  Pages with no vector content (e.g. raster-only) are skipped.
 *
 * @param data      Raw PDF bytes, as received from `fs.readFileBinary`.
 * @param baseName  Filename without extension — used as the import name.
 *                  Multi-page PDFs append `_p<N>` (e.g. `logo_p1`).
 */
export async function importPdf(
  data: Uint8Array,
  baseName: string,
): Promise<SvgImport[]> {
  const pdfjs = await getPdfjsLib();

  // pdfjs requires a copy of the buffer (not a view) so it doesn't get
  // neutered when the underlying ArrayBuffer is transferred via IPC.
  const loadTask = pdfjs.getDocument({ data: data.slice(0) });
  const pdf = await loadTask.promise;
  const numPages = pdf.numPages;

  const imports: SvgImport[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    const rawPaths = await extractPagePaths(page);
    if (rawPaths.length === 0) continue;

    const svgPaths: SvgPath[] = rawPaths.map((d) => ({
      id: uuid(),
      d,
      svgSource: `<path d="${d}"/>`,
      visible: true,
    }));

    // Normalize: translate all paths so their bounding box starts at (0, 0).
    // This matches what the SVG import does and ensures the G-code worker's
    // coordinate system is consistent.
    const bounds = computePathsBounds(svgPaths.map((p) => p.d));
    const effW = bounds ? bounds.maxX - bounds.minX : pageWidth;
    const effH = bounds ? bounds.maxY - bounds.minY : pageHeight;

    const normalizedPaths = bounds
      ? svgPaths.map((p) => ({
          ...p,
          d: applyMatrixToPathD(
            p.d,
            new DOMMatrix([1, 0, 0, 1, -bounds.minX, -bounds.minY]),
          ),
        }))
      : svgPaths;

    const name = numPages === 1 ? baseName : `${baseName}_p${pageNum}`;

    imports.push({
      id: uuid(),
      name,
      paths: normalizedPaths,
      x: 0,
      y: 0,
      // 1 PDF point = 25.4/72 mm — sets the real-world physical scale
      scale: PT_TO_MM,
      rotation: 0,
      visible: true,
      svgWidth: effW,
      svgHeight: effH,
      viewBoxX: 0,
      viewBoxY: 0,
    });
  }

  return imports;
}
