import type { PageSize, PageTemplate } from "../../../../../types";

interface ResolvePageBoundsArgs {
  bedW: number;
  bedH: number;
  pageTemplate: PageTemplate | null;
  pageSizes: PageSize[];
}

export interface ResolvedPageBounds {
  pageW: number;
  pageH: number;
  canAlignToTemplate: boolean;
  marginMM: number;
}

export function resolvePageBounds({
  bedW,
  bedH,
  pageTemplate,
  pageSizes,
}: ResolvePageBoundsArgs): ResolvedPageBounds {
  const activePageSize = pageTemplate
    ? pageSizes.find((ps) => ps.id === pageTemplate.sizeId)
    : null;

  const canAlignToTemplate = !!pageTemplate && !!activePageSize;

  const pageW = activePageSize
    ? pageTemplate!.landscape
      ? activePageSize.heightMM
      : activePageSize.widthMM
    : bedW;

  const pageH = activePageSize
    ? pageTemplate!.landscape
      ? activePageSize.widthMM
      : activePageSize.heightMM
    : bedH;

  return {
    pageW,
    pageH,
    canAlignToTemplate,
    marginMM: pageTemplate?.marginMM ?? 20,
  };
}

const NATIVE_SCALE_MM_PER_PX = 25.4 / 96;

interface ComputeBitmapFitScaleArgs {
  naturalWidth: number;
  naturalHeight: number;
  bedW: number;
  bedH: number;
  pageTemplate: PageTemplate | null;
  pageSizes: PageSize[];
}

/**
 * The mm-per-pixel scale a freshly-imported bitmap should use: native 96 DPI
 * unless that would make the image bigger than the bed (or, with a page
 * template active, bigger than the page's margin-inset area), in which case
 * it's capped down to fit. Only ever scales down — a small image stays at
 * native size rather than being blown up to fill the bed, since "fit" isn't
 * "fill" and upscaling a fresh import would be a surprising default.
 *
 * Every tone-spine/halftone renderer's point count scales with an import's
 * physical size, so capping this at import time (rather than leaving a
 * oversized default to be fixed up later via the manual "Fit to Bed"
 * control (this reuses the same math as that) is what keeps a large photo
 * from generating an unworkable amount of preview geometry in the first
 * place.
 */
export function computeBitmapFitScale({
  naturalWidth,
  naturalHeight,
  bedW,
  bedH,
  pageTemplate,
  pageSizes,
}: ComputeBitmapFitScaleArgs): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) return NATIVE_SCALE_MM_PER_PX;

  const { pageW, pageH, canAlignToTemplate, marginMM } = resolvePageBounds({
    bedW,
    bedH,
    pageTemplate,
    pageSizes,
  });
  const targetW = canAlignToTemplate ? Math.max(0, pageW - 2 * marginMM) : bedW;
  const targetH = canAlignToTemplate ? Math.max(0, pageH - 2 * marginMM) : bedH;

  const fitScale = Math.min(targetW / naturalWidth, targetH / naturalHeight);
  return Math.min(NATIVE_SCALE_MM_PER_PX, fitScale);
}
