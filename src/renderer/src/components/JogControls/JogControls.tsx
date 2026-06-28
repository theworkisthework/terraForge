import { useState, useEffect } from "react";
import { isSolenoidPenType, type JogStep } from "../../../../types";
import { useMachineStore } from "../../store/machineStore";
import { Button } from "../ui";
import { StepSelector } from "./StepSelector";
import { JogPad } from "./JogPad";
import { PenControls } from "./PenControls";
import { JogSpeedInput } from "./JogSpeedInput";
import { PositioningSection } from "./PositioningSection";

const STEPS: JogStep[] = [0.1, 1, 10, 100];

interface Props {
  onClose?: () => void;
}

export function JogControls({ onClose }: Props) {
  const [step, setStep] = useState<JogStep>(1);
  const activeConfig = useMachineStore((s) => s.activeConfig());
  const connected = useMachineStore((s) => s.connected);
  const [feedrate, setFeedrate] = useState<number>(
    () => activeConfig?.jogSpeed ?? 3000,
  );

  // Sync jog speed when the active machine profile changes
  useEffect(() => {
    setFeedrate(activeConfig?.jogSpeed ?? 3000);
  }, [activeConfig?.id]);

  const penUp = activeConfig?.penUpCommand ?? "";
  const penDown = activeConfig?.penDownCommand ?? "";
  const penType = activeConfig?.penType ?? "solenoid-hardware";

  const movePen = async (dir: 1 | -1) => {
    if (!isSolenoidPenType(penType)) {
      const dist = (step * dir).toFixed(3);
      await window.terraForge.fluidnc.sendCommand(
        `$J=G91 G21 Z${dist} F${feedrate}`,
      );
    } else {
      const cmd = dir === -1 ? penDown : penUp;
      if (cmd) await window.terraForge.fluidnc.sendCommand(cmd);
    }
  };

  const jog = async (axis: string, dir: 1 | -1) => {
    const dist = (step * dir).toFixed(3);
    const cmd = `$J=G91 G21 ${axis}${dist} F${feedrate}`;
    await window.terraForge.fluidnc.sendCommand(cmd);
  };

  const goToOrigin = async () => {
    await window.terraForge.fluidnc.sendCommand("G0 X0 Y0");
  };

  const zeroZ = async () => {
    await window.terraForge.fluidnc.sendCommand("G10 L20 P1 Z0");
  };

  const home = async () => {
    await window.terraForge.fluidnc.sendCommand("$H");
  };

  const setZero = async () => {
    await window.terraForge.fluidnc.sendCommand("G10 L20 P1 X0 Y0");
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
          Jog Controls
        </span>
        {onClose && (
          <Button variant="ghost" size="xs" onClick={onClose}>
            ✕
          </Button>
        )}
      </div>

      <StepSelector step={step} onChange={setStep} />

      <JogPad
        step={step}
        connected={connected}
        jog={jog}
        goToOrigin={goToOrigin}
      />

      <PenControls
        connected={connected}
        penType={penType}
        penDown={penDown}
        penUp={penUp}
        step={step}
        onMovePen={movePen}
        onZeroZ={zeroZ}
      />

      <JogSpeedInput feedrate={feedrate} onChange={setFeedrate} />

      <PositioningSection
        connected={connected}
        onHome={home}
        onSetZero={setZero}
      />
    </div>
  );
}
