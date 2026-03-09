import React, { useState } from "react";
import {
  CircleSlash2,
  House,
  ArrowBigUp,
  ArrowBigDown,
  ArrowBigLeft,
  ArrowBigRight,
  Pen,
  PenLine,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type { JogStep } from "../../../types";
import { useMachineStore } from "../store/machineStore";
import { Tooltip } from "./Tooltip";

const STEPS: JogStep[] = [0.1, 1, 10, 100];

interface Props {
  onClose?: () => void;
}

export function JogControls({ onClose }: Props) {
  const [step, setStep] = useState<JogStep>(1);
  const [feedrate, setFeedrate] = useState(3000);
  const activeConfig = useMachineStore((s) => s.activeConfig());
  const penUp = activeConfig?.penUpCommand ?? "";
  const penDown = activeConfig?.penDownCommand ?? "";
  const penType = activeConfig?.penType ?? "solenoid";

  const movePen = async (dir: 1 | -1) => {
    if (penType !== "solenoid") {
      // servo / stepper: jog Z incrementally, same as X/Y — $J is cancellable
      // and works on all FluidNC versions (3.x and 4.x).  G0 Z<abs> was
      // unreliable on 3.x (motor clunk but no movement without prior homing).
      const dist = (step * dir).toFixed(3);
      await window.terraForge.fluidnc.sendCommand(
        `$J=G91 G21 Z${dist} F${feedrate}`,
      );
    } else {
      // Solenoid — send the configured pen up/down command (e.g. M3S0/M3S1)
      const cmd = dir === -1 ? penDown : penUp;
      if (cmd) await window.terraForge.fluidnc.sendCommand(cmd);
    }
  };

  const penDownTitle =
    penType !== "solenoid"
      ? `Pen Down: jog Z by -${step} mm`
      : penDown
        ? `Pen Down: ${penDown}`
        : "No pen-down command configured";

  const penUpTitle =
    penType !== "solenoid"
      ? `Pen Up: jog Z by +${step} mm`
      : penUp
        ? `Pen Up: ${penUp}`
        : "No pen-up command configured";

  const jog = async (axis: string, dir: 1 | -1) => {
    const dist = (step * dir).toFixed(3);
    const cmd = `$J=G91 G21 ${axis}${dist} F${feedrate}`;
    await window.terraForge.fluidnc.sendCommand(cmd);
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Jog Controls
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Step selector */}
      <div className="flex gap-1 mb-4">
        {STEPS.map((s) => (
          <Tooltip
            key={s}
            text="Selected increment to move X, Y & Z by"
            className="flex-1"
          >
            <button
              onClick={() => setStep(s)}
              className={`w-full py-1 rounded text-xs transition-colors ${step === s ? "bg-[#e94560] text-white" : "bg-[#0f3460] hover:bg-[#1a4a8a] text-gray-300"}`}
            >
              {s}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* XY pad */}
      <div className="grid grid-cols-3 gap-1 mb-4 w-36 mx-auto">
        <div />
        <JogBtn
          label={<ArrowBigUp size={16} />}
          title={`Move Y +${step} mm`}
          ariaLabel="Jog Y+"
          onClick={() => jog("Y", 1)}
        />
        <div />

        <JogBtn
          label={<ArrowBigLeft size={16} />}
          title={`Move X -${step} mm`}
          ariaLabel="Jog X-"
          onClick={() => jog("X", -1)}
        />
        <JogBtn
          label={<House size={14} />}
          title="Move pen to X0, Y0"
          ariaLabel="Go to origin"
          onClick={async () => {
            await window.terraForge.fluidnc.sendCommand("G0 X0 Y0");
          }}
        />
        <JogBtn
          label={<ArrowBigRight size={16} />}
          title={`Move X +${step} mm`}
          ariaLabel="Jog X+"
          onClick={() => jog("X", 1)}
        />

        <div />
        <JogBtn
          label={<ArrowBigDown size={16} />}
          title={`Move Y -${step} mm`}
          ariaLabel="Jog Y-"
          onClick={() => jog("Y", -1)}
        />
        <div />
      </div>

      {/* Pen down / up / zero-Z */}
      <div className="flex gap-1 justify-center mb-4">
        <Tooltip text={penDownTitle}>
          <button
            aria-label="Pen down"
            onClick={() => movePen(-1)}
            disabled={penType === "solenoid" && !penDown}
            className="py-1.5 px-2 rounded text-xs bg-[#0f3460] hover:bg-[#1a4a8a] active:bg-[#e94560] text-gray-200 transition-colors disabled:opacity-40 flex items-center justify-center gap-0.5"
          >
            <PenLine size={15} />
            <ArrowDown size={11} />
          </button>
        </Tooltip>
        <Tooltip text={penUpTitle}>
          <button
            aria-label="Pen up"
            onClick={() => movePen(1)}
            disabled={penType === "solenoid" && !penUp}
            className="py-1.5 px-2 rounded text-xs bg-[#0f3460] hover:bg-[#1a4a8a] active:bg-[#e94560] text-gray-200 transition-colors disabled:opacity-40 flex items-center justify-center gap-0.5"
          >
            <Pen size={15} />
            <ArrowUp size={11} />
          </button>
        </Tooltip>
        <Tooltip text="Zero Z axis (set current Z position as Z0)">
          <button
            aria-label="Zero Z"
            onClick={async () => {
              await window.terraForge.fluidnc.sendCommand("G10 L20 P1 Z0");
            }}
            className="py-1.5 px-2 rounded text-xs bg-[#0f3460] hover:bg-[#1a4a8a] active:bg-[#e94560] text-gray-200 transition-colors flex items-center justify-center"
          >
            <CircleSlash2 size={14} />
          </button>
        </Tooltip>
      </div>

      {/* Feedrate */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          Feedrate mm/min
        </label>
        <input
          type="number"
          value={feedrate}
          min={100}
          max={10000}
          step={100}
          onChange={(e) => setFeedrate(+e.target.value)}
          className="w-full text-xs bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-gray-200"
        />
      </div>

      {/* Positioning shortcuts */}
      <div className="flex flex-col gap-1 mt-4">
        <span className="text-[9px] uppercase tracking-wider text-gray-500">
          Positioning
        </span>
        <Tooltip text="Run the machine homing cycle ($H)">
          <button
            onClick={async () => {
              await window.terraForge.fluidnc.sendCommand("$H");
            }}
            className="w-full py-1.5 rounded text-xs bg-[#0f3460] hover:bg-[#1a4a8a] text-gray-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <House size={13} />
            Run Homing
          </button>
        </Tooltip>
        <Tooltip text="Set the current position as X0, Y0 (Z is unaffected)">
          <button
            onClick={async () => {
              await window.terraForge.fluidnc.sendCommand("G10 L20 P1 X0 Y0");
            }}
            className="w-full py-1.5 rounded text-xs bg-[#0f3460] hover:bg-[#1a4a8a] text-gray-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <CircleSlash2 size={13} />
            Set Zero
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function JogBtn({
  label,
  onClick,
  title,
  ariaLabel,
}: {
  label: React.ReactNode;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
}) {
  const btn = (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="py-1.5 px-2 rounded text-xs bg-[#0f3460] hover:bg-[#1a4a8a] active:bg-[#e94560] text-gray-200 transition-colors font-mono flex items-center justify-center w-full"
    >
      {label}
    </button>
  );
  return title ? <Tooltip text={title}>{btn}</Tooltip> : btn;
}
