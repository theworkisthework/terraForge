import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { discoverBitmapPlugins } from "../../../src/main/plugins/pluginManifest";

async function writePlugin(
  pluginsDir: string,
  folderName: string,
  manifest: Record<string, unknown> | string,
): Promise<void> {
  const folder = join(pluginsDir, folderName);
  await mkdir(folder, { recursive: true });
  const contents =
    typeof manifest === "string" ? manifest : JSON.stringify(manifest);
  await writeFile(join(folder, "manifest.json"), contents, "utf-8");
}

const validManifest = {
  id: "acme.halftone",
  label: "Acme Halftone",
  apiVersion: 1,
  entry: "index.js",
  defaults: { dotSize: 2 },
  fields: [
    { type: "number", key: "dotSize", label: "Dot size (mm)", min: 0.1, max: 10, step: 0.1 },
  ],
};

describe("discoverBitmapPlugins", () => {
  let pluginsDir: string;

  beforeEach(async () => {
    pluginsDir = await mkdtemp(join(tmpdir(), "terraforge-plugins-"));
  });

  afterEach(async () => {
    await rm(pluginsDir, { recursive: true, force: true });
  });

  it("returns nothing for an empty directory", async () => {
    const result = await discoverBitmapPlugins(pluginsDir);
    expect(result.plugins).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("loads a valid manifest without executing any code", async () => {
    await writePlugin(pluginsDir, "acme-halftone", validManifest);

    const result = await discoverBitmapPlugins(pluginsDir);

    expect(result.errors).toEqual([]);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].manifest).toMatchObject({
      id: "acme.halftone",
      label: "Acme Halftone",
      apiVersion: 1,
    });
    expect(result.plugins[0].entryPath).toBe(
      join(pluginsDir, "acme-halftone", "index.js"),
    );
  });

  it("reports an error for malformed JSON without throwing", async () => {
    await writePlugin(pluginsDir, "broken", "{ not json");

    const result = await discoverBitmapPlugins(pluginsDir);

    expect(result.plugins).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].folder).toBe("broken");
  });

  it("rejects an unsupported apiVersion", async () => {
    await writePlugin(pluginsDir, "future", { ...validManifest, id: "future.plugin", apiVersion: 99 });

    const result = await discoverBitmapPlugins(pluginsDir);

    expect(result.plugins).toEqual([]);
    expect(result.errors[0].message).toMatch(/apiVersion/);
  });

  it("rejects a field schema missing required properties", async () => {
    await writePlugin(pluginsDir, "bad-field", {
      ...validManifest,
      id: "bad.field",
      fields: [{ type: "number", key: "x", label: "X" }], // missing min/max/step
    });

    const result = await discoverBitmapPlugins(pluginsDir);

    expect(result.plugins).toEqual([]);
    expect(result.errors[0].message).toMatch(/fields\[0\]/);
  });

  it("rejects an entry path that escapes the plugin's own folder", async () => {
    await writePlugin(pluginsDir, "escapee", {
      ...validManifest,
      id: "escapee.plugin",
      entry: "../../../etc/passwd",
    });

    const result = await discoverBitmapPlugins(pluginsDir);

    expect(result.plugins).toEqual([]);
    expect(result.errors[0].message).toMatch(/own folder/);
  });

  it("keeps the first plugin and reports later folders on duplicate ids", async () => {
    await writePlugin(pluginsDir, "a-first", { ...validManifest, id: "dup.id" });
    await writePlugin(pluginsDir, "b-second", { ...validManifest, id: "dup.id" });

    const result = await discoverBitmapPlugins(pluginsDir);

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].folder).toBe(join(pluginsDir, "a-first"));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].folder).toBe("b-second");
    expect(result.errors[0].message).toMatch(/duplicate/);
  });

  it("skips folders with no manifest.json", async () => {
    await mkdir(join(pluginsDir, "not-a-plugin"), { recursive: true });

    const result = await discoverBitmapPlugins(pluginsDir);

    expect(result.plugins).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
