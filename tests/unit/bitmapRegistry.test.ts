import { describe, it, expect } from "vitest";
import {
  bitmapRenderers,
  findBitmapRenderer,
  getBitmapRenderer,
  pluginRendererFromManifest,
} from "../../src/renderer/src/features/bitmap-renderers/registry";
import { SPIRAL_AMPLITUDE_RENDERER_ID } from "../../src/renderer/src/features/bitmap-renderers/spiralAmplitude";
import type { RendererPluginManifest } from "../../src/types";

const pluginManifest: RendererPluginManifest = {
  id: "acme.halftone",
  label: "Acme Halftone",
  apiVersion: 1,
  defaults: { dotSize: 2 },
  fields: [
    { type: "number", key: "dotSize", label: "Dot size (mm)", min: 0.1, max: 10, step: 0.1 },
  ],
};

describe("findBitmapRenderer", () => {
  it("returns undefined for an unset id", () => {
    expect(findBitmapRenderer(undefined)).toBeUndefined();
  });

  it("finds an in-tree renderer by id", () => {
    expect(findBitmapRenderer(SPIRAL_AMPLITUDE_RENDERER_ID)?.id).toBe(SPIRAL_AMPLITUDE_RENDERER_ID);
  });

  it("finds a plugin renderer by id when its manifest is supplied", () => {
    const found = findBitmapRenderer("acme.halftone", [pluginManifest]);
    expect(found?.label).toBe("Acme Halftone");
    expect(found?.defaults).toEqual({ dotSize: 2 });
  });

  it("does not silently substitute a different renderer for an unresolvable id", () => {
    expect(findBitmapRenderer("acme.uninstalled", [])).toBeUndefined();
    expect(findBitmapRenderer("acme.uninstalled", [pluginManifest])).toBeUndefined();
  });
});

describe("getBitmapRenderer", () => {
  it("defaults to spiral-amplitude for an unset id", () => {
    expect(getBitmapRenderer(undefined).id).toBe(SPIRAL_AMPLITUDE_RENDERER_ID);
  });

  it("defaults to spiral-amplitude for an unresolvable id (legacy defaulting behavior)", () => {
    expect(getBitmapRenderer("acme.uninstalled", []).id).toBe(SPIRAL_AMPLITUDE_RENDERER_ID);
  });

  it("returns the matching plugin renderer when installed", () => {
    expect(getBitmapRenderer("acme.halftone", [pluginManifest]).label).toBe("Acme Halftone");
  });
});

describe("pluginRendererFromManifest", () => {
  it("carries the manifest's id, label, defaults, and fields through unchanged", () => {
    const renderer = pluginRendererFromManifest(pluginManifest);
    expect(renderer.id).toBe(pluginManifest.id);
    expect(renderer.label).toBe(pluginManifest.label);
    expect(renderer.defaults).toBe(pluginManifest.defaults);
    expect(renderer.fields).toBe(pluginManifest.fields);
    expect(typeof renderer.render).toBe("function");
  });

  it("builds one definition per manifest, so repeated lookups do not rebuild it", () => {
    expect(pluginRendererFromManifest(pluginManifest)).toBe(pluginRendererFromManifest(pluginManifest));
    // A rescan replaces the manifest object, and with it the definition.
    expect(pluginRendererFromManifest({ ...pluginManifest })).not.toBe(pluginRendererFromManifest(pluginManifest));
  });

  it("carries the manifest's source declaration, defaulting to required", () => {
    expect(pluginRendererFromManifest(pluginManifest).source).toBe("required");
    expect(pluginRendererFromManifest({ ...pluginManifest, source: "none" }).source).toBe("none");
  });

  it("versions a plugin by its source hash", () => {
    expect(pluginRendererFromManifest({ ...pluginManifest, sourceHash: "abc" }).version).toBe("plugin:abc");
  });
});

describe("bitmapRenderers", () => {
  it("still ships spiral-amplitude in-tree", () => {
    expect(bitmapRenderers.some((r) => r.id === SPIRAL_AMPLITUDE_RENDERER_ID)).toBe(true);
  });

  it("declares every in-tree renderer as needing a source image", () => {
    expect(bitmapRenderers.every((renderer) => renderer.source === "required")).toBe(true);
  });

  it("gives every in-tree renderer a version, so changed output can be detected", () => {
    for (const renderer of bitmapRenderers) {
      expect(renderer.version, renderer.id).toMatch(/\S/);
    }
  });
});
