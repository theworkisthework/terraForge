import { useState } from "react";
import type { JogStep } from "../../../types";

const STEPS: JogStep[] = [0.1, 1, 10, 100];

interface Props {
  onClose?: () => void;
}

export function JogControls({ onClose }: Props) {
  const [step, setStep] = useState<JogStep>(1);
  const [feedrate, setFeedrate] = useState(3000);

  const jog = async (axis: string, dir: 1 | -1) => {
    const dist = (step * dir).toFixed(3);
    const cmd = `$J=G91 G21 ${axis}${dist} F${feedrate}`;
    await window.terraForge.fluidnc.sendCommand(cmd);
  };

  const jogZ = async (dir: 1 | -1) => {
    const dist = (step * dir).toFixed(3);
    await window.terraForge.fluidnc.sendCommand(
      `$J=G91 G21 Z${dist} F${feedrate}`,
    );
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
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 py-1 rounded text-xs transition-colors ${step === s ? "bg-[#e94560] text-white" : "bg-[#0f3460] hover:bg-[#1a4a8a] text-gray-300"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* XY pad */}
      <div className="grid grid-cols-3 gap-1 mb-4 w-36 mx-auto">
        <div />
        <JogBtn label="▲ Y+" onClick={() => jog("Y", 1)} />
        <div />

        <JogBtn label="◄ X-" onClick={() => jog("X", -1)} />
        <JogBtn
          label="⌂"
          onClick={async () => {
            await window.terraForge.fluidnc.sendCommand("G0 X0 Y0");
          }}
        />
        <JogBtn label="X+ ►" onClick={() => jog("X", 1)} />

        <div />
        <JogBtn label="Y- ▼" onClick={() => jog("Y", -1)} />
        <div />
      </div>

      {/* Z control */}
      <div className="flex gap-1 justify-center mb-4">
        <JogBtn label="Z+" onClick={() => jogZ(1)} />
        <JogBtn label="Z-" onClick={() => jogZ(-1)} />
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
    </div>
  );
}

function JogBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="py-1.5 px-2 rounded text-xs bg-[#0f3460] hover:bg-[#1a4a8a] active:bg-[#e94560] text-gray-200 transition-colors font-mono"
    >
      {label}
    </button>
  );
}
