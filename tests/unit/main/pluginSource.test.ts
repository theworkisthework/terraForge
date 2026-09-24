import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readPluginModules } from "../../../src/main/plugins/pluginSource";
import type { BitmapPluginRecord } from "../../../src/main/plugins/pluginManifest";

function record(folder: string, entry = "index.js"): BitmapPluginRecord {
  return {
    manifest: { id: "acme", label: "Acme", apiVersion: 1, defaults: {}, fields: [] },
    entryPath: join(folder, entry),
    folder,
  };
}

describe("readPluginModules", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "terraforge-plugin-src-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("collects the plugin's own js and json files keyed by relative posix path", async () => {
    await writeFile(join(folder, "index.js"), "module.exports = 1;", "utf-8");
    await mkdir(join(folder, "lib"), { recursive: true });
    await writeFile(join(folder, "lib", "helper.js"), "exports.a = 1;", "utf-8");
    await writeFile(join(folder, "data.json"), '{"k":1}', "utf-8");

    const { modules, entry } = await readPluginModules(record(folder));

    expect(entry).toBe("index.js");
    expect(Object.keys(modules).sort()).toEqual(["data.json", "index.js", "lib/helper.js"]);
    expect(modules["lib/helper.js"]).toBe("exports.a = 1;");
  });

  it("ignores node_modules, dotfolders, and non-loadable file types", async () => {
    await writeFile(join(folder, "index.js"), "", "utf-8");
    await writeFile(join(folder, "README.md"), "docs", "utf-8");
    await mkdir(join(folder, "node_modules", "left-pad"), { recursive: true });
    await writeFile(join(folder, "node_modules", "left-pad", "index.js"), "", "utf-8");
    await mkdir(join(folder, ".git"), { recursive: true });
    await writeFile(join(folder, ".git", "hook.js"), "", "utf-8");

    const { modules } = await readPluginModules(record(folder));
    expect(Object.keys(modules)).toEqual(["index.js"]);
  });

  it("does not follow symlinks out of the plugin folder", async () => {
    const outside = await mkdtemp(join(tmpdir(), "terraforge-outside-"));
    try {
      await writeFile(join(outside, "secret.js"), "module.exports='secret';", "utf-8");
      await writeFile(join(folder, "index.js"), "", "utf-8");
      await symlink(join(outside, "secret.js"), join(folder, "linked.js"));

      const { modules } = await readPluginModules(record(folder));
      expect(Object.keys(modules)).toEqual(["index.js"]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects a plugin whose source is larger than the cap", async () => {
    await writeFile(join(folder, "index.js"), "x".repeat(3 * 1024 * 1024), "utf-8");
    await expect(readPluginModules(record(folder))).rejects.toThrow(/exceeds/);
  });

  it("rejects a plugin with more files than the cap", async () => {
    for (let i = 0; i < 70; i++) {
      await writeFile(join(folder, `mod${i}.js`), "", "utf-8");
    }
    await expect(readPluginModules(record(folder))).rejects.toThrow(/more than/);
  });

  it("fails when the manifest entry is not among the collected files", async () => {
    await writeFile(join(folder, "other.js"), "", "utf-8");
    await expect(readPluginModules(record(folder))).rejects.toThrow(/was not found/);
  });
});
