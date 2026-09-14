/**
 * Copies the example renderer plugins into the build output.
 *
 * They ship inside the app so the user can install them from Application
 * Configuration without downloading anything. Landing them under `out/` means
 * one runtime path — `<dirname of main>/../plugin-examples` — works the same
 * in development and in a packaged build, rather than branching on
 * `app.isPackaged` and only ever exercising one of the two branches.
 *
 * Runs after `electron-vite build`, which clears `out/`.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "examples", "plugins");
const target = join(root, "out", "plugin-examples");

await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
console.log(`copied example plugins -> ${target}`);
