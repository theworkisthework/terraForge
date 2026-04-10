import { ChevronDown } from "lucide-react";
import type { RotStep } from "../utils/rotation";

interface RotationStepFlyoutProps {
  rotStep: RotStep;
  rotSteps: readonly RotStep[];
  stepFlyoutOpen: boolean;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (step: RotStep) => void;
}

export function RotationStepFlyout({
  rotStep,
  rotSteps,
  stepFlyoutOpen,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
}: RotationStepFlyoutProps) {
  return (
    <div className="relative">
      <button
        className="flex items-center gap-0.5 px-1.5 py-1 text-[10px] text-content-muted hover:text-content rounded hover:bg-secondary/40 transition-colors"
        title="Change rotation step"
        onClick={onToggleStepFlyout}
      >
        {rotStep}°
        <ChevronDown size={10} strokeWidth={2.5} />
      </button>
      {stepFlyoutOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onCloseStepFlyout} />
          <div className="absolute bottom-full left-0 mb-1 bg-panel border border-border-ui rounded shadow-xl z-20 py-0.5 min-w-[4rem]">
            {rotSteps.map((s) => (
              <button
                key={s}
                className={`block w-full text-left px-3 py-1 text-[10px] transition-colors ${
                  rotStep === s
                    ? "text-content bg-secondary"
                    : "text-content-muted hover:text-content hover:bg-secondary/50"
                }`}
                onClick={() => onSelectRotStep(s)}
              >
                {s}°
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
