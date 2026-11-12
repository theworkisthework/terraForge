import { BUILT_IN_PAGE_SIZES, type PageTemplate } from "../../../../../types";
import type { CanvasHistory } from "../history";
import type { CanvasStateCreator, PageTemplateSlice } from "../types";

/**
 * A margin typed digit by digit or a colour dragged in the picker is one
 * undo step; choosing another page, turning it or removing it is a step of
 * its own.
 */
function pageEditKey(from: PageTemplate | null, to: PageTemplate | null): string | undefined {
  if (!from || !to || from.sizeId !== to.sizeId || from.landscape !== to.landscape) return undefined;
  const changed = (["marginMM", "paperColor", "penColor"] as const).filter((key) => from[key] !== to[key]);
  return `page:${changed.join(",")}`;
}

export const createPageTemplateSlice = (
  { edit }: CanvasHistory,
): CanvasStateCreator<PageTemplateSlice> => (set, get) => ({
  pageTemplate: null,
  pageSizes: BUILT_IN_PAGE_SIZES,

  setPageTemplate: (template) => {
    const key = pageEditKey(get().pageTemplate, template);
    // The same page again (a control re-reporting its value) is no edit.
    if (key === "page:") return;
    edit((state) => {
      state.pageTemplate = template;
    }, key);
  },

  setPageSizes: (sizes) =>
    set((state) => {
      state.pageSizes = sizes;
    }),
});
