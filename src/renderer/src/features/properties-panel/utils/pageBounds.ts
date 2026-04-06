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
