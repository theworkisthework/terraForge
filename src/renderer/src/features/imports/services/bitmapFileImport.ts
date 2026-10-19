/**
 * Turning an image file into a bitmap import: stored at a resolution the
 * pen can use, rendered once with the default renderer, and placed at the
 * machine origin's corner.
 */
import { v4 as uuid } from "uuid";
import {
  bitmapRenderSignature,
  bitmapSurface,
  loadBitmapForImport,
  materializeBitmapLayers,
} from "../../bitmap-renderers/bitmapImage";
import { getBitmapRenderer } from "../../bitmap-renderers/registry";
import { computeBitmapFitScale } from "../../properties-panel/utils/pageBounds";
import { pageColors } from "../../../utils/paper";
import type { MachineConfig, PageSize, PageTemplate, SvgImport } from "../../../../../types";

/** The MIME type for a bitmap file's extension; PNG unless JPEG or WebP. */
export function bitmapMimeType(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "png";
  return extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png";
}

export async function buildBitmapImport(
  bytes: Uint8Array,
  name: string,
  mimeType: string,
  {
    machine,
    pageTemplate,
    pageSizes,
    currentPage,
  }: {
    machine: MachineConfig | undefined;
    /** Sizes the image to fit the page. */
    pageTemplate: PageTemplate | null;
    pageSizes: PageSize[];
    /** The page as it is now: its paper and pen decide how the bitmap renders. */
    currentPage: PageTemplate | null;
  },
): Promise<SvgImport> {
  // The fit scale has to be known before the renderer runs, not just for
  // display afterwards: every tone-spine/halftone renderer's point count
  // scales with the import's physical size, and an oversized default
  // produces an unworkable amount of preview geometry. It also decides
  // whether a very high-resolution image is stored smaller.
  const { dataUrl: bitmapDataUrl, width: imageWidth, height: imageHeight, baseScale } = await loadBitmapForImport(
    bytes,
    mimeType,
    (naturalWidth, naturalHeight) =>
      computeBitmapFitScale({
        naturalWidth,
        naturalHeight,
        bedW: machine?.bedWidth ?? 220,
        bedH: machine?.bedHeight ?? 200,
        pageTemplate,
        pageSizes,
      }),
  );
  const importId = uuid();
  const defaultRenderer = getBitmapRenderer(undefined);
  const bitmapRendererSettings = { ...defaultRenderer.defaults };
  const renderInputs = {
    id: importId,
    bitmapDataUrl,
    bitmapRendererId: defaultRenderer.id,
    bitmapRendererSettings,
    bitmapBaseScale: baseScale,
  };
  const surface = bitmapSurface(undefined, pageColors(currentPage));
  const { bitmapRendererPath, paths, rendererVersion, warnings } = await materializeBitmapLayers(renderInputs, { surface });
  const objW = imageWidth * baseScale;
  const objH = imageHeight * baseScale;
  const origin = machine?.origin ?? "bottom-left";
  return {
    id: importId,
    name,
    kind: "bitmap",
    paths,
    x: origin.includes("right") ? (machine?.bedWidth ?? 220) - objW : 0,
    y: origin.includes("top") ? -objH : 0,
    scale: baseScale,
    rotation: 0,
    visible: true,
    svgWidth: imageWidth,
    svgHeight: imageHeight,
    viewBoxX: 0,
    viewBoxY: 0,
    bitmapDataUrl,
    bitmapMimeType: mimeType,
    bitmapRendererId: defaultRenderer.id,
    bitmapRendererSettings,
    bitmapRendererPath,
    bitmapBaseScale: baseScale,
    bitmapOpacity: 0.25,
    // Stamped now so selecting the new import does not immediately
    // re-render geometry that was just produced.
    bitmapRenderSignature: bitmapRenderSignature(renderInputs, surface),
    bitmapRendererVersion: rendererVersion,
    bitmapRenderWarnings: warnings?.length ? warnings : undefined,
    bitmapSourceVisible: true,
    bitmapPreviewOpacity: 1,
    bitmapPreviewVisible: true,
  };
}
