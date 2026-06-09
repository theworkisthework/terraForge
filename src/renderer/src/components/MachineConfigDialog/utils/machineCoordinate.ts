const G53_PREFIX = "G53 ";

export function hasMachineCoordinatePrefix(command: string): boolean {
  return /^G53\s+/.test(command.trimStart());
}

export function addMachineCoordinatePrefix(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return G53_PREFIX.trimEnd();
  return hasMachineCoordinatePrefix(trimmed)
    ? trimmed
    : `${G53_PREFIX}${trimmed}`;
}

export function removeMachineCoordinatePrefix(command: string): string {
  return command.trim().replace(/^G53\s+/, "");
}
