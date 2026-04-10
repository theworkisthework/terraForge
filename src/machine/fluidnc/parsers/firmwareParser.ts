export interface FirmwareProbeInfo {
  raw: string;
  version: string;
  major: number;
  wsPort: number | null;
}

export function parseFirmwareProbeResponse(
  text: string,
): FirmwareProbeInfo | null {
  const fwMatch = text.match(
    /FW\s+version\s*:\s*(?:FluidNC\s+)?v?(\d+)\.(\d+)(?:\.(\d+))?/i,
  );
  const verMatch = !fwMatch
    ? text.match(/\[VER[:\s]+(?:FluidNC\s+)?v?(\d+)\.(\d+)(?:\.(\d+))?/i)
    : null;
  const semver =
    !fwMatch && !verMatch ? text.match(/\bv?(\d+)\.(\d+)\.(\d+)/) : null;

  const match = fwMatch ?? verMatch ?? semver;
  if (!match) return null;

  const major = parseInt(match[1], 10);
  const version = `${match[1]}.${match[2]}${match[3] ? `.${match[3]}` : ""}`;
  const wsPortMatch = text.match(/webcommunication[^#]*Sync:\s*(\d+)/i);
  const wsPort = wsPortMatch ? parseInt(wsPortMatch[1], 10) : null;

  return { raw: text.trim(), version, major, wsPort };
}
