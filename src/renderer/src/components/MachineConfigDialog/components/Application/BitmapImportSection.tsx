import { Badge } from "../../../Badge";
import { Section } from "../Section";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

interface BitmapImportSectionProps {
  controller: MachineConfigDialogController;
}

export function BitmapImportSection({ controller }: BitmapImportSectionProps) {
  const { appConfig } = controller;
  const { bitmapRendererEnabled, setBitmapRendererEnabled } = appConfig;

  return (
    <Section title="Bitmap Import">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={bitmapRendererEnabled}
          onChange={(e) => setBitmapRendererEnabled(e.currentTarget.checked)}
          className="mt-0.5 accent-accent"
        />
        <div className="space-y-1">
          <div className="text-sm text-content flex items-center gap-2 flex-wrap">
            <span>Enable bitmap import</span>
            <Badge variant="warning">Experimental</Badge>
          </div>
          <p className="text-xs text-content-faint">
            Lets you import a photo or image and turn it into plottable geometry via a
            renderer plugin. Large or highly-detailed renders can still make the canvas
            sluggish to pan and zoom — off by default while that gets ironed out.
          </p>
        </div>
      </label>
    </Section>
  );
}
