import type { SvgImport } from "../../../../../types";
import { resolveToneSettings, TONE_FIELDS } from "../../bitmap-renderers/toneAdjust";
import { RendererFieldControl } from "./RendererFieldControl";

/**
 * Tone shaping for the source image, shared by every renderer — see
 * `toneAdjust.ts`. Lives outside the renderer's own controls because it is
 * applied before the renderer runs, and survives switching renderer.
 */
export function BitmapToneSection({ imp, onUpdate }: { imp: SvgImport; onUpdate: (changes: Partial<SvgImport>) => void }) {
  const tone = resolveToneSettings(imp);

  return (
    <div className="mt-2 pt-2 border-t border-border-ui/30">
      <span className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5">Tone</span>
      <div className="grid grid-cols-2 gap-2">
        {TONE_FIELDS.map((field) => (
          <RendererFieldControl
            key={field.key}
            field={field}
            value={tone[field.key as keyof typeof tone]}
            // The whole resolved set is written, not just the changed key, so
            // an older drawing's renderer-level tone settings carry over
            // explicitly the first time tone is edited.
            onChange={(value) => onUpdate({ bitmapTone: { ...tone, [field.key]: value } })}
          />
        ))}
      </div>
    </div>
  );
}
