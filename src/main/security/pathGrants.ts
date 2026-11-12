/**
 * Which files the window may ask the main process to read and write.
 *
 * The renderer names files by path, and the main process has the user's full
 * access to the disk. Without a check, anything that got to run in the
 * window — through a crafted SVG, say — could read or overwrite any file the
 * user can. So a path is only honoured if the user picked it in a native
 * file dialog, which is shown by the main process and which the window
 * cannot answer for them.
 *
 * Grants last until the app quits. Nothing is remembered between runs.
 */
import { dirname, resolve } from "path";

export type PathAccess = "read" | "write";

export interface PathGrants {
  /** A file the user picked to open. It may be read. */
  grantRead(path: string): void;
  /** A file the user picked to save to. It may be written, and read back. */
  grantWrite(path: string): void;
  /**
   * A folder the user picked to save into. Files directly inside it may be
   * written. Nothing in it may be read, and its subfolders are not included.
   */
  grantDirectory(path: string): void;
  /**
   * The full path to use, if `path` may be accessed this way.
   * @throws if the user never picked it.
   */
  check(path: unknown, access: PathAccess): string;
}

export function createPathGrants(): PathGrants {
  const readable = new Set<string>();
  const writable = new Set<string>();
  const directories = new Set<string>();

  return {
    grantRead: (path) => void readable.add(resolve(path)),
    grantWrite: (path) => void writable.add(resolve(path)),
    grantDirectory: (path) => void directories.add(resolve(path)),

    check(path, access) {
      if (typeof path !== "string" || path.length === 0) {
        throw new Error(`Refused to ${access} a file: no path was given.`);
      }
      // Resolved before comparing, so that "chosen/../other" is judged as
      // the file it really names.
      const full = resolve(path);
      const allowed =
        writable.has(full) ||
        (access === "read" ? readable.has(full) : directories.has(dirname(full)));
      if (!allowed) {
        throw new Error(`Refused to ${access} ${full}: it was not chosen in a file dialog.`);
      }
      return full;
    },
  };
}
