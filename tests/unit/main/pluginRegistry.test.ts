import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { BitmapPluginRegistry } from "../../../src/main/plugins/pluginRegistry";

const manifestFor = (id: string) => ({
  id,
  label: id,
  apiVersion: 1,
  entry: "index.js",
  defaults: {},
  fields: [],
});

async function writePlugin(
  dir: string,
  folder: string,
  manifest: Record<string, unknown> | string,
): Promise<void> {
  await mkdir(join(dir, folder), { recursive: true });
  await writeFile(
    join(dir, folder, "manifest.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    "utf-8",
  );
}

describe("BitmapPluginRegistry", () => {
  let pluginsDir: string;

  beforeEach(async () => {
    pluginsDir = await mkdtemp(join(tmpdir(), "terraforge-registry-"));
  });

  afterEach(async () => {
    await rm(pluginsDir, { recursive: true, force: true });
  });

  it("scans once for ready(), however many callers await it", async () => {
    await writePlugin(pluginsDir, "alpha", manifestFor("alpha"));
    const registry = new BitmapPluginRegistry(pluginsDir);

    await Promise.all([registry.ready(), registry.ready(), registry.ready()]);
    expect(registry.list()).toHaveLength(1);

    // A plugin appearing after the first scan stays invisible until an
    // explicit rescan — proving ready() did not scan a second time.
    await writePlugin(pluginsDir, "beta", manifestFor("beta"));
    await registry.ready();
    expect(registry.list()).toHaveLength(1);

    await registry.rescan();
    expect(registry.list()).toHaveLength(2);
  });

  it("treats an explicit rescan as having satisfied the initial scan", async () => {
    await writePlugin(pluginsDir, "alpha", manifestFor("alpha"));
    const registry = new BitmapPluginRegistry(pluginsDir);

    await registry.rescan();
    await writePlugin(pluginsDir, "beta", manifestFor("beta"));
    await registry.ready();

    expect(registry.list()).toHaveLength(1);
  });

  it("keeps the last scan's per-folder rejection reasons", async () => {
    await writePlugin(pluginsDir, "good", manifestFor("good"));
    await writePlugin(pluginsDir, "bad", { ...manifestFor("bad"), apiVersion: 99 });

    const registry = new BitmapPluginRegistry(pluginsDir);
    await registry.ready();

    expect(registry.list()).toHaveLength(1);
    expect(registry.lastErrors()).toHaveLength(1);
    expect(registry.lastErrors()[0]).toMatchObject({ folder: "bad" });
    expect(registry.find("good")).toBeDefined();
    expect(registry.find("bad")).toBeUndefined();
  });

  it("clears stale errors once the offending plugin is fixed", async () => {
    await writePlugin(pluginsDir, "bad", "{ not json");
    const registry = new BitmapPluginRegistry(pluginsDir);
    await registry.ready();
    expect(registry.lastErrors()).toHaveLength(1);

    await writePlugin(pluginsDir, "bad", manifestFor("fixed"));
    await registry.rescan();

    expect(registry.lastErrors()).toEqual([]);
    expect(registry.list()).toHaveLength(1);
  });
});
