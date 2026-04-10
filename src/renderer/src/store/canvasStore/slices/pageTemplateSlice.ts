import { BUILT_IN_PAGE_SIZES } from "../../../../../types";
import type { CanvasStateCreator, PageTemplateSlice } from "../types";

export const createPageTemplateSlice: CanvasStateCreator<PageTemplateSlice> = (
  set,
) => ({
  pageTemplate: null,
  pageSizes: BUILT_IN_PAGE_SIZES,

  setPageTemplate: (template) =>
    set((state) => {
      state.pageTemplate = template;
    }),

  setPageSizes: (sizes) =>
    set((state) => {
      state.pageSizes = sizes;
    }),
});
