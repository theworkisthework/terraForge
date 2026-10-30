import { describe, expect, it } from "vitest";
import { PluginSourceCache, PluginSourceMissingError } from "../../../src/main/plugins/pluginSourceCache";

const image = (id: string, bytes: number) => ({ id, width: bytes, height: 1, values: new Uint8Array(bytes) });

describe("PluginSourceCache", () => {
  it("keeps an image sent with its pixels and hands it back by id alone", () => {
    const cache = new PluginSourceCache(100);
    const sent = image("a", 10);
    cache.resolve(sent);

    const found = cache.resolve({ id: "a", width: 10, height: 1 });
    expect(found.values).toBe(sent.values);
    expect(found).toMatchObject({ id: "a", width: 10, height: 1 });
  });

  it("throws a recognisable error for an id it does not hold", () => {
    const cache = new PluginSourceCache(100);
    expect(() => cache.resolve({ id: "nope", width: 1, height: 1 })).toThrow(PluginSourceMissingError);
  });

  it("lets the least recently used image go first once over budget", () => {
    const cache = new PluginSourceCache(30);
    cache.resolve(image("a", 10));
    cache.resolve(image("b", 10));
    cache.resolve(image("c", 10));
    cache.resolve({ id: "a", width: 10, height: 1 }); // a is now the most recent
    cache.resolve(image("d", 10));

    expect(() => cache.resolve({ id: "b", width: 10, height: 1 })).toThrow(PluginSourceMissingError);
    for (const id of ["a", "c", "d"]) expect(() => cache.resolve({ id, width: 10, height: 1 })).not.toThrow();
  });

  it("passes an image larger than the whole budget through without keeping it", () => {
    const cache = new PluginSourceCache(30);
    cache.resolve(image("small", 10));
    const huge = image("huge", 31);

    expect(cache.resolve(huge).values).toBe(huge.values);
    expect(() => cache.resolve({ id: "huge", width: 31, height: 1 })).toThrow(PluginSourceMissingError);
    expect(() => cache.resolve({ id: "small", width: 10, height: 1 })).not.toThrow();
  });

  it("replaces an id sent again with new pixels, counting its size once", () => {
    const cache = new PluginSourceCache(20);
    cache.resolve(image("a", 10));
    const again = image("a", 10);
    cache.resolve(again);
    cache.resolve(image("b", 10));

    expect(cache.size).toBe(2);
    expect(cache.resolve({ id: "a", width: 10, height: 1 }).values).toBe(again.values);
  });

  it("lets go of images unused for longer than the idle limit", () => {
    const cache = new PluginSourceCache(100, 1000);
    cache.resolve(image("old", 10), 0);
    cache.resolve(image("fresh", 10), 900);
    cache.sweep(1500);

    expect(() => cache.resolve({ id: "old", width: 10, height: 1 })).toThrow(PluginSourceMissingError);
    expect(() => cache.resolve({ id: "fresh", width: 10, height: 1 })).not.toThrow();
  });

  it("refuses a source with no usable id, or pixels that are not bytes", () => {
    const cache = new PluginSourceCache(100);
    expect(() => cache.resolve({ id: "", width: 1, height: 1, values: new Uint8Array(1) })).toThrow(/valid id/);
    expect(() => cache.resolve({ id: "x".repeat(65), width: 1, height: 1 })).toThrow(/valid id/);
    expect(() => cache.resolve({ id: "a", width: 1, height: 1, values: [1] as never })).toThrow(/Uint8Array/);
  });
});
