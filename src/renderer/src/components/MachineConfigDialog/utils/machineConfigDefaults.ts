import type { MachineConfig, PenType } from "../../../../../types";

export const PEN_DEFAULTS: Record<
  PenType,
  {
    penUpCommand: string;
    penDownCommand: string;
    penDownDelayMs: number;
    penUpDelayMs: number;
  }
> = {
  "solenoid-hardware": {
    penUpCommand: "M3S0",
    penDownCommand: "M3S1",
    penDownDelayMs: 50,
    penUpDelayMs: 0,
  },
  "solenoid-software": {
    penUpCommand: "G53 G0Z1",
    penDownCommand: "G53 G0Z0",
    penDownDelayMs: 50,
    penUpDelayMs: 0,
  },
  servo: {
    penUpCommand: "G0Z15",
    penDownCommand: "G0Z0",
    penDownDelayMs: 0,
    penUpDelayMs: 0,
  },
  stepper: {
    penUpCommand: "G0Z15",
    penDownCommand: "G0Z0",
    penDownDelayMs: 0,
    penUpDelayMs: 0,
  },
};

export const EMPTY_CONFIG: Omit<MachineConfig, "id"> = {
  name: "New Machine",
  bedWidth: 220,
  bedHeight: 200,
  origin: "bottom-left",
  penType: "solenoid-hardware",
  penUpCommand: PEN_DEFAULTS["solenoid-hardware"].penUpCommand,
  penDownCommand: PEN_DEFAULTS["solenoid-hardware"].penDownCommand,
  invertZJogControls: false,
  penDownDelayMs: PEN_DEFAULTS["solenoid-hardware"].penDownDelayMs,
  penUpDelayMs: PEN_DEFAULTS["solenoid-hardware"].penUpDelayMs,
  jogSpeed: 3000,
  drawSpeed: 3000,
  connection: { type: "wifi", host: "fluidnc.local", port: 80 },
};
