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

  /**
   * Field schemas drive React components in the properties panel, so a bad
   * one used to be able to take the whole renderer down. Everything the panel
   * reads has to be rejected here instead.
   */
  describe("field schema validation", () => {
    async function errorFor(manifest: Record<string, unknown>): Promise<string> {
      await writePlugin(pluginsDir, "candidate", manifest);
      const result = await discoverBitmapPlugins(pluginsDir);
      expect(result.plugins).toEqual([]);
      expect(result.errors).toHaveLength(1);
      return result.errors[0].message;
    }

    const numberField = {
      type: "number",
      key: "angle",
      label: "Angle",
      min: -180,
      max: 180,
      step: 1,
    };

    const selectField = {
      type: "select",
      key: "axis",
      label: "Axis",
      options: [{ value: "x", label: "Horizontal" }],
    };

    it("accepts a manifest using every schema feature", async () => {
      await writePlugin(pluginsDir, "rich", {
        id: "acme.rich",
        label: "Rich",
        apiVersion: 1,
        entry: "index.js",
        renderTimeoutMs: 8000,
        defaults: { angle: 0, invert: false, axis: "x" },
        fields: [
          {
            ...numberField,
            control: "slider",
            presets: [
              { label: "+90", delta: 90, icon: "rotate-cw" },
              { label: "-90", delta: -90, icon: "rotate-ccw", ariaLabel: "Rotate left" },
            ],
          },
          { type: "boolean", key: "invert", label: "Invert" },
          {
            ...selectField,
            control: "icon-buttons",
            options: [
              { value: "x", label: "Horizontal", icon: "arrow-left-right" },
              { value: "y", label: "Vertical", icon: "arrow-up-down" },
            ],
          },
        ],
      });

      const result = await discoverBitmapPlugins(pluginsDir);
      expect(result.errors).toEqual([]);
      expect(result.plugins).toHaveLength(1);
    });

    it("rejects an icon name this build has no component for", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { axis: "x" },
        fields: [{ ...selectField, options: [{ value: "x", label: "X", icon: "sparkles" }] }],
      });
      expect(message).toMatch(/icon must be one of/);
    });

    it("rejects an unknown icon on a number field preset", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { angle: 0 },
        fields: [{ ...numberField, presets: [{ label: "+90", delta: 90, icon: "spin" }] }],
      });
      expect(message).toMatch(/presets\[0\]\.icon/);
    });

    it("rejects a preset with no delta", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { angle: 0 },
        fields: [{ ...numberField, presets: [{ label: "+90" }] }],
      });
      expect(message).toMatch(/presets\[0\]\.delta/);
    });

    it("rejects presets that are not an array", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { angle: 0 },
        fields: [{ ...numberField, presets: "lots" }],
      });
      expect(message).toMatch(/presets must be an array/);
    });

    it("rejects select options that are not objects", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { axis: "x" },
        fields: [{ ...selectField, options: ["x", "y"] }],
      });
      expect(message).toMatch(/options\[0\] is not an object/);
    });

    it("rejects a select option with no value", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { axis: "x" },
        fields: [{ ...selectField, options: [{ label: "Horizontal" }] }],
      });
      expect(message).toMatch(/options\[0\]\.value/);
    });

    it("rejects a control the panel cannot render", async () => {
      expect(
        await errorFor({
          ...validManifest,
          defaults: { angle: 0 },
          fields: [{ ...numberField, control: "dial" }],
        }),
      ).toMatch(/control must be "input" or "slider"/);
    });

    it("rejects an inverted range and a non-positive step", async () => {
      expect(
        await errorFor({
          ...validManifest,
          defaults: { angle: 0 },
          fields: [{ ...numberField, min: 10, max: 1 }],
        }),
      ).toMatch(/min must not be greater than/);

      expect(
        await errorFor({
          ...validManifest,
          defaults: { angle: 0 },
          fields: [{ ...numberField, step: 0 }],
        }),
      ).toMatch(/step must be greater than zero/);
    });

    it("rejects a non-finite bound (JSON overflows to Infinity)", async () => {
      await writePlugin(
        pluginsDir,
        "candidate",
        '{"id":"a","label":"A","apiVersion":1,"entry":"index.js","defaults":{"angle":0},' +
          '"fields":[{"type":"number","key":"angle","label":"Angle","min":1e999,"max":10,"step":1}]}',
      );
      const result = await discoverBitmapPlugins(pluginsDir);
      expect(result.plugins).toEqual([]);
      expect(result.errors[0].message).toMatch(/finite numeric min\/max\/step/);
    });

    it("rejects a field key declared twice", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { angle: 0 },
        fields: [numberField, { ...numberField, label: "Angle again" }],
      });
      expect(message).toMatch(/declared more than once/);
    });
  });

  describe("defaults validation", () => {
    async function errorFor(manifest: Record<string, unknown>): Promise<string> {
      await writePlugin(pluginsDir, "candidate", manifest);
      const result = await discoverBitmapPlugins(pluginsDir);
      expect(result.plugins).toEqual([]);
      expect(result.errors).toHaveLength(1);
      return result.errors[0].message;
    }

    it("requires a default for every declared field", async () => {
      const message = await errorFor({ ...validManifest, defaults: {} });
      expect(message).toMatch(/missing a value for field "dotSize"/);
    });

    it("requires the default to match the field's type", async () => {
      const message = await errorFor({ ...validManifest, defaults: { dotSize: "big" } });
      expect(message).toMatch(/must be a number/);
    });

    it("requires a select default to be one of its own options", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { axis: "z" },
        fields: [
          { type: "select", key: "axis", label: "Axis", options: [{ value: "x", label: "X" }] },
        ],
      });
      expect(message).toMatch(/one of that field's option values/);
    });

    it("rejects a default that is not a settings primitive", async () => {
      const message = await errorFor({
        ...validManifest,
        defaults: { dotSize: 2, extra: { nested: true } },
      });
      expect(message).toMatch(/finite number, boolean, or string/);
    });

    it("defaults a manifest that says nothing about a source to requiring one", async () => {
      await writePlugin(pluginsDir, "tracer", validManifest);
      const result = await discoverBitmapPlugins(pluginsDir);
      expect(result.plugins[0].manifest.source).toBe("required");
    });

    it("accepts a generator that declares it needs no source", async () => {
      await writePlugin(pluginsDir, "generator", {
        id: "acme.spirograph",
        label: "Spirograph",
        apiVersion: 1,
        entry: "index.js",
        source: "none",
        defaults: { arms: 5 },
        fields: [{ type: "number", key: "arms", label: "Arms", min: 1, max: 12, step: 1 }],
      });

      const result = await discoverBitmapPlugins(pluginsDir);
      expect(result.errors).toEqual([]);
      expect(result.plugins[0].manifest.source).toBe("none");
    });

    it("accepts a generator that a source may optionally modulate", async () => {
      await writePlugin(pluginsDir, "hybrid", { ...validManifest, source: "optional" });
      const result = await discoverBitmapPlugins(pluginsDir);
      expect(result.errors).toEqual([]);
      expect(result.plugins[0].manifest.source).toBe("optional");
    });

    it("rejects an unknown source mode", async () => {
      expect(await errorFor({ ...validManifest, source: "sometimes" })).toMatch(/manifest\.source/);
    });

    it("rejects a non-positive renderTimeoutMs", async () => {
      expect(await errorFor({ ...validManifest, renderTimeoutMs: 0 })).toMatch(/renderTimeoutMs/);
      expect(await errorFor({ ...validManifest, renderTimeoutMs: -5 })).toMatch(/renderTimeoutMs/);
    });
  });
});
