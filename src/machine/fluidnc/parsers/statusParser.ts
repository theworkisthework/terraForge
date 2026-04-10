import type { MachineStatus } from "../../../types";

export function parseMachineStatus(raw: string): MachineStatus {
  const stateMatch = raw.match(/<([^|>]+)/);
  const mposMatch = raw.match(/MPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
  const wposMatch = raw.match(/WPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
  const lnMatch = raw.match(/Ln:(\d+)(?:,(\d+))?/);

  const stateStr = stateMatch?.[1] ?? "Unknown";
  const stateName = stateStr.split(":")[0];
  const validStates = [
    "Idle",
    "Run",
    "Hold",
    "Jog",
    "Alarm",
    "Door",
    "Check",
    "Home",
    "Sleep",
  ];
  const state = (
    validStates.includes(stateName) ? stateName : "Unknown"
  ) as MachineStatus["state"];

  const mpos = mposMatch
    ? { x: +mposMatch[1], y: +mposMatch[2], z: +mposMatch[3] }
    : { x: 0, y: 0, z: 0 };

  const wpos = wposMatch
    ? { x: +wposMatch[1], y: +wposMatch[2], z: +wposMatch[3] }
    : { ...mpos };

  const lineNum = lnMatch ? parseInt(lnMatch[1], 10) : undefined;
  const lineTotal =
    lnMatch?.[2] !== undefined ? parseInt(lnMatch[2], 10) : undefined;

  return { raw, state, mpos, wpos, lineNum, lineTotal };
}
