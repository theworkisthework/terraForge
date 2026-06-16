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
}

/**
 * A 3×3 directional pad for jogging X/Y axes, with a centre "go to origin" button.
 */
export function JogPad({ step, connected, jog, goToOrigin }: JogPadProps) {
  return (
    <div className="grid grid-cols-3 gap-1 mb-4 w-36 mx-auto">
      <div />
      <JogBtn
        label={<ArrowBigUp size={16} />}
        title={`Move Y +${step} mm`}
        ariaLabel="Jog Y+"
        onClick={() => jog("Y", 1)}
        disabled={!connected}
      />
      <div />

      <JogBtn
        label={<ArrowBigLeft size={16} />}
        title={`Move X -${step} mm`}
        ariaLabel="Jog X-"
        onClick={() => jog("X", -1)}
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
        title={`Move X +${step} mm`}
        ariaLabel="Jog X+"
        onClick={() => jog("X", 1)}
        disabled={!connected}
      />

      <div />
      <JogBtn
        label={<ArrowBigDown size={16} />}
        title={`Move Y -${step} mm`}
        ariaLabel="Jog Y-"
        onClick={() => jog("Y", -1)}
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
