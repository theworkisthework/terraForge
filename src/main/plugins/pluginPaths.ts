import { mkdirSync, existsSync } from "fs";
import { join } from "path";

/** Resolves and ensures the directory users drop bitmap-renderer plugin folders into. */
export function resolveBitmapPluginsDir(userDataPath: string): string {
  const pluginsDir = join(userDataPath, "bitmap-plugins");
  if (!existsSync(pluginsDir)) {
    mkdirSync(pluginsDir, { recursive: true });
  }
  return pluginsDir;
}
