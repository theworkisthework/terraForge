import type { RemoteFile } from "../../../types";

interface FilesResponse {
  files?: Array<{ name: string; size: number; dir?: boolean }>;
}

interface SdFilesResponse {
  files?: Array<{
    name: string;
    shortname?: string;
    size: string;
    datetime?: string;
  }>;
  path?: string;
  status?: string;
}

export function parseRemoteFiles(
  remotePath: string,
  response: FilesResponse,
): RemoteFile[] {
  return (response.files ?? []).map((file) => ({
    name: file.name,
    path: `${remotePath === "/" ? "" : remotePath}/${file.name}`,
    size: file.size ?? 0,
    isDirectory: !!file.dir,
  }));
}

export function parseSdRemoteFiles(
  remotePath: string,
  response: SdFilesResponse,
): RemoteFile[] {
  if (
    response.status &&
    typeof response.status === "string" &&
    !response.status.toLowerCase().startsWith("ok") &&
    !response.files
  ) {
    throw new Error(`SD card: ${response.status}`);
  }

  const prefix = remotePath === "/" ? "" : remotePath.replace(/\/$/, "");
  return (response.files ?? []).map((file) => ({
    name: file.name,
    path: `${prefix}/${file.name}`,
    size: parseInt(file.size, 10),
    isDirectory: file.size === "-1",
  }));
}
