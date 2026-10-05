import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Home,
  Pen,
  PenLine,
} from "lucide-react";
import { isSolenoidPenType, type JogStep } from "../../../types";
import { Button } from "../../../renderer/src/components/ui";
import { sendLogged } from "../commands";
import { useMachineStore } from "../../../renderer/src/store/machineStore";
import { useStableMachineState } from "../../../renderer/src/hooks/useStableMachineState";

const STEPS: JogStep[] = [0.1, 1, 10, 100];

export function JogScreen() {
  const cfg = useMachineStore((s) => s.activeConfig());
  const online = useMachineStore((s) => s.connected);
  const machineState = useStableMachineState(
    useMachineStore((s) => s.status?.state),
  );
  // Jogging while a job runs would fight the plot, so lock it out.
  const jobActive = machineState === "Run" || machineState === "Hold";
  const connected = online && !jobActive;
  const [step, setStep] = useState<JogStep>(10);
  const [feed, setFeed] = useState(cfg?.jogSpeed ?? 3000);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setFeed(cfg?.jogSpeed ?? 3000), [cfg?.id, cfg?.jogSpeed]);

  const origin = cfg?.origin;
  const flipX = origin === "bottom-right" || origin === "top-right";
  const flipY = origin === "top-left" || origin === "top-right";
  const penType = cfg?.penType ?? "solenoid-hardware";
  const solenoid = isSolenoidPenType(penType);

  const run = async (cmd: string) => {
    setErr(null);
    try {
      await sendLogged(cmd);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const jog = (axis: "X" | "Y" | "Z", dir: 1 | -1) =>
    run(`$J=G91 G21 ${axis}${(step * dir).toFixed(3)} F${feed}`);

  const penMove = (down: boolean) => {
    if (solenoid) {
      const cmd = down ? cfg?.penDownCommand : cfg?.penUpCommand;
      return cmd ? run(cmd) : undefined;
    }
    const std = down ? -1 : 1;
    return jog("Z", (cfg?.invertZJogControls ? -std : std) as 1 | -1);
  };

  const pad =
    "h-20 w-20 rounded-xl bg-secondary active:bg-secondary-hover text-content disabled:opacity-40 inline-flex items-center justify-center select-none";

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {!connected && (
        <p className="text-sm text-content-muted text-center">
          {online
            ? "Jog is locked while a job is running."
            : "Connect to a machine to jog it."}
        </p>
      )}

      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s) => (
          <Button
            key={s}
            variant="toggle"
            selected={step === s}
            size="lg"
            className="py-3 text-base"
            onClick={() => setStep(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      <p className="text-center text-xs text-content-muted -mt-4">Step (mm)</p>

      <div className="mx-auto grid grid-cols-3 gap-2 w-fit">
        <span />
        <button
          className={pad}
          disabled={!connected}
          onClick={() => jog("Y", flipY ? -1 : 1)}
          aria-label="Jog Y+"
        >
          <ArrowUp size={28} />
        </button>
        <span />
        <button
          className={pad}
          disabled={!connected}
          onClick={() => jog("X", flipX ? 1 : -1)}
          aria-label="Jog X-"
        >
          <ArrowLeft size={28} />
        </button>
        <button
          className={pad}
          disabled={!connected}
          onClick={() => run("G0 X0 Y0")}
          aria-label="Go to origin"
          title="Go to work origin"
        >
          <Home size={26} />
        </button>
        <button
          className={pad}
          disabled={!connected}
          onClick={() => jog("X", flipX ? -1 : 1)}
          aria-label="Jog X+"
        >
          <ArrowRight size={28} />
        </button>
        <span />
        <button
          className={pad}
          disabled={!connected}
          onClick={() => jog("Y", flipY ? 1 : -1)}
          aria-label="Jog Y-"
        >
          <ArrowDown size={28} />
        </button>
        <span />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          className="py-3"
          disabled={!connected}
          icon={<PenLine size={18} />}
          onClick={() => penMove(true)}
        >
          Pen down
        </Button>
        <Button
          size="lg"
          className="py-3"
          disabled={!connected}
          icon={<Pen size={18} />}
          onClick={() => penMove(false)}
        >
          Pen up
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" disabled={!connected} onClick={() => run("$H")}>
          Home ($H)
        </Button>
        <Button
          size="lg"
          disabled={!connected}
          onClick={() => run("G10 L20 P1 X0 Y0")}
        >
          Set zero here
        </Button>
      </div>

      <label className="block text-xs text-content-muted">
        Jog speed (mm/min)
        <input
          type="number"
          inputMode="numeric"
          value={feed}
          onChange={(e) => setFeed(Number(e.target.value) || 0)}
          className="mt-1 w-full bg-app border border-border-ui rounded px-3 py-2 text-base text-content"
        />
      </label>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
