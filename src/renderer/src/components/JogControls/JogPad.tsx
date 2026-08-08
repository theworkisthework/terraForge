import React from "react";
import {
  House,
  ArrowBigUp,
  ArrowBigDown,
  ArrowBigLeft,
  ArrowBigRight,
} from "lucide-react";
import type { JogStep } from "../../../../types";
import { Button } from "../ui";

interface JogPadProps {
  step: JogStep;
  connected: boolean;
  jog: (axis: string, dir: 1 | -1) => Promise<void>;
  goToOrigin: () => Promise<void>;
  invertXJogControls: boolean;
  invertYJogControls: boolean;
}

/**
 * A 3×3 directional pad for jogging X/Y axes, with a centre "go to origin" button.
 */
export function JogPad({
  step,
  connected,
  jog,
  goToOrigin,
  invertXJogControls,
  invertYJogControls,
}: JogPadProps) {
  const leftDir: 1 | -1 = invertXJogControls ? 1 : -1;
  const rightDir: 1 | -1 = invertXJogControls ? -1 : 1;
  const upDir: 1 | -1 = invertYJogControls ? -1 : 1;
  const downDir: 1 | -1 = invertYJogControls ? 1 : -1;

  return (
    <div className="grid grid-cols-3 gap-1 mb-4 w-36 mx-auto">
      <div />
      <JogBtn
        label={<ArrowBigUp size={16} />}
        title={`Move Y ${upDir > 0 ? "+" : "-"}${step} mm`}
        ariaLabel={`Jog Y${upDir > 0 ? "+" : "-"}`}
        onClick={() => jog("Y", upDir)}
        disabled={!connected}
      />
      <div />

      <JogBtn
        label={<ArrowBigLeft size={16} />}
        title={`Move X ${leftDir > 0 ? "+" : "-"}${step} mm`}
        ariaLabel={`Jog X${leftDir > 0 ? "+" : "-"}`}
        onClick={() => jog("X", leftDir)}
        disabled={!connected}
      />
      <JogBtn
        label={<House size={14} />}
        title="Move pen to X0, Y0"
        ariaLabel="Go to origin"
        onClick={goToOrigin}
        disabled={!connected}
      />
      <JogBtn
        label={<ArrowBigRight size={16} />}
        title={`Move X ${rightDir > 0 ? "+" : "-"}${step} mm`}
        ariaLabel={`Jog X${rightDir > 0 ? "+" : "-"}`}
        onClick={() => jog("X", rightDir)}
        disabled={!connected}
      />

      <div />
      <JogBtn
        label={<ArrowBigDown size={16} />}
        title={`Move Y ${downDir > 0 ? "+" : "-"}${step} mm`}
        ariaLabel={`Jog Y${downDir > 0 ? "+" : "-"}`}
        onClick={() => jog("Y", downDir)}
        disabled={!connected}
      />
      <div />
    </div>
  );
}

function JogBtn({
  label,
  onClick,
  title,
  ariaLabel,
  disabled,
}: {
  label: React.ReactNode;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="w-full font-mono"
    >
      {label}
    </Button>
  );
}
