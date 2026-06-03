import { useEffect, useRef, useState } from "react";
import type { MachineStatus } from "../../../types";

export const MACHINE_IDLE_GRACE_MS = 800;

type MachineState = MachineStatus["state"] | null | undefined;

function isActiveState(state: MachineState): state is "Run" | "Hold" {
  return state === "Run" || state === "Hold";
}

export function useStableMachineState(
  state: MachineState,
  idleGraceMs = MACHINE_IDLE_GRACE_MS,
): MachineState {
  const [displayState, setDisplayState] = useState<MachineState>(state ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (state == null) {
      setDisplayState(null);
      return;
    }

    if (state !== "Idle" || !isActiveState(displayState)) {
      setDisplayState(state);
      return;
    }

    // Keep the prior active state visible through brief Run/Hold -> Idle blips.
    timerRef.current = setTimeout(() => {
      setDisplayState("Idle");
      timerRef.current = null;
    }, idleGraceMs);
  }, [displayState, idleGraceMs, state]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return displayState;
}
