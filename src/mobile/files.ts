import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Mobile has no real paths. The renderer only treats a "path" as an opaque
// string whose last segment is the file name, so we hand out virtual paths:
//
//   /picked/<id>/<name>  – a file the user chose with the system picker,
//                          held in memory as a Blob
//   /save/<name>         – an export target; writing it saves to the app
//                          cache and opens the system share sheet
//
// `/save` also doubles as the "directory" returned by chooseDirectory().

const picked = new Map<string, File | Blob>();
let counter = 0;

export const SAVE_DIR = "/save";

const GCODE_ACCEPT = ".gcode,.nc,.g,.gc,.gco,.ngc,.ncc,.cnc,.tap";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function pickFile(accept?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // Android's picker is unreliable with extension-only filters (it hides
    // files whose MIME it can't resolve, e.g. .gcode), so only filter when
    // every entry maps to a well-known type.
    if (accept) input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      const id = `${Date.now().toString(36)}${(counter++).toString(36)}`;
      const path = `/picked/${id}/${file.name}`;
      picked.set(path, file);
      finish(path);
    };
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export const pickers = {
  svg: () => pickFile(".svg,image/svg+xml"),
  pdf: () => pickFile(".pdf,application/pdf"),
  any: () => pickFile(),
  // See note in pickFile: G-code has no registered MIME, so don't filter.
  gcode: () => pickFile(),
  import: () => pickFile(),
  layout: () => pickFile(),
  json: () => pickFile(".json,application/json"),
};

export { GCODE_ACCEPT };

export async function readPickedBytes(path: string): Promise<Uint8Array> {
  const blob = picked.get(path);
  if (!blob) throw new Error(`File is no longer available: ${basename(path)}`);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function readPickedText(path: string): Promise<string> {
  const blob = picked.get(path);
  if (!blob) throw new Error(`File is no longer available: ${basename(path)}`);
  return blob.text();
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Save content for the user: native share sheet on device, download in a browser. */
export async function exportFile(
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  const name = basename(path);
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([content as BlobPart]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const written =
    typeof content === "string"
      ? await Filesystem.writeFile({
          path: name,
          data: content,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
      : await Filesystem.writeFile({
          path: name,
          data: toBase64(content),
          directory: Directory.Cache,
        });
  try {
    await Share.share({ title: name, files: [written.uri], dialogTitle: `Save ${name}` });
  } catch {
    // Dismissing the share sheet rejects on some platforms — not an error.
  }
}

/** Write to a virtual path. Only /save/* targets and picked files are valid. */
export async function writeVirtual(
  path: string,
  content: string,
): Promise<void> {
  if (path.startsWith(`${SAVE_DIR}/`)) return exportFile(path, content);
  // Overwrite of a picked file (e.g. re-saving a layout) → treat as export.
  return exportFile(`${SAVE_DIR}/${basename(path)}`, content);
}
