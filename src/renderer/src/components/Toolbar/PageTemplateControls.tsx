import { PenLine } from "lucide-react";
import type { PageSize, PageTemplate } from "../../../../types";
import { Button } from "../ui";
import { DEFAULT_PAPER_COLOR, DEFAULT_PEN_COLOR, PAPER_PRESETS } from "../../utils/paper";

const swatchClassName =
  "w-6 h-6 p-0 border border-border-ui rounded cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none";

interface PageTemplateControlsProps {
  pageTemplate: PageTemplate | null;
  pageSizes: PageSize[];
  setPageTemplate: (t: PageTemplate | null) => void;
}

export function PageTemplateControls({
  pageTemplate,
  pageSizes,
  setPageTemplate,
}: PageTemplateControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <select
        className="bg-app border border-border-ui rounded px-2 py-1 text-sm text-content max-w-[110px]"
        value={pageTemplate?.sizeId ?? "none"}
        title="Page template — adds a size guide overlay to the canvas"
        onChange={(e) => {
          const id = e.target.value;
          if (id === "none") {
            setPageTemplate(null);
          } else {
            setPageTemplate({
              ...pageTemplate,
              sizeId: id,
              landscape: pageTemplate?.landscape ?? true,
              marginMM: pageTemplate?.marginMM ?? 20,
            });
          }
        }}
      >
        <option value="none">No page</option>
        {pageSizes.map((ps) => (
          <option key={ps.id} value={ps.id}>
            {ps.name}
          </option>
        ))}
      </select>

      {/* Portrait / landscape toggle — only shown when a page is selected */}
      {pageTemplate && (
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() =>
            setPageTemplate({
              ...pageTemplate,
              landscape: !pageTemplate.landscape,
              marginMM: pageTemplate.marginMM ?? 20,
            })
          }
          title={
            pageTemplate.landscape
              ? "Landscape — click to switch to portrait"
              : "Portrait — click to switch to landscape"
          }
        >
          {pageTemplate.landscape ? (
            /* Landscape page icon */
            <svg
              width="16"
              height="12"
              viewBox="0 0 16 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1" />
            </svg>
          ) : (
            /* Portrait page icon */
            <svg
              width="11"
              height="15"
              viewBox="0 0 11 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="0.75" y="0.75" width="9.5" height="13.5" rx="1" />
            </svg>
          )}
        </Button>
      )}

      {/* Margin input — only shown when a page is selected */}
      {pageTemplate && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={pageTemplate.marginMM ?? 20}
            onChange={(e) =>
              setPageTemplate({
                ...pageTemplate,
                marginMM: Math.max(
                  0,
                  Math.min(100, Number(e.target.value) || 0),
                ),
              })
            }
            className="w-14 bg-app border border-border-ui rounded px-2 py-1 text-sm text-content text-right"
            title="Page margin in mm"
          />
          <span className="text-xs text-content-muted">mm</span>
        </div>
      )}

      {/* Paper and pen — what the preview shows the drawing on and with */}
      {pageTemplate && (
        <div className="flex items-center gap-1">
          <input
            type="color"
            aria-label="Paper colour"
            title="Paper colour — shown on the canvas, and what colour separation mixes inks against"
            list="paper-color-presets"
            value={pageTemplate.paperColor ?? DEFAULT_PAPER_COLOR}
            onChange={(e) => setPageTemplate({ ...pageTemplate, paperColor: e.target.value })}
            className={swatchClassName}
          />
          <datalist id="paper-color-presets">
            {PAPER_PRESETS.map((preset) => (
              <option key={preset.color} value={preset.color} label={preset.label} />
            ))}
          </datalist>
          <input
            type="color"
            aria-label="Pen colour"
            title="Pen colour — the preview colour of anything without an ink colour of its own"
            value={pageTemplate.penColor ?? DEFAULT_PEN_COLOR}
            onChange={(e) => setPageTemplate({ ...pageTemplate, penColor: e.target.value })}
            className={swatchClassName}
          />
        </div>
      )}

      {/* Edit custom page sizes file */}
      <Button
        variant="secondary"
        size="icon-sm"
        onClick={() => window.terraForge.config.openPageSizesFile()}
        title="Edit custom page sizes (opens page-sizes.json in your default editor)"
      >
        <PenLine size={12} />
      </Button>
    </div>
  );
}
