import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  installExamplePlugins,
  resolveBundledExamplesDir,
} from "../../../src/main/plugins/pluginPaths";

describe("resolveBundledExamplesDir", () => {
  it("sits next to the built main process, so one path serves dev and packaged builds", () => {
    expect(resolveBundledExamplesDir(join("/app", "out", "main"))).toBe(
      join("/app", "out", "plugin-examples"),
    );
  });
});

describe("installExamplePlugins", () => {
  let examplesDir: string;
  let pluginsDir: string;

  beforeEach(async () => {
    examplesDir = await mkdtemp(join(tmpdir(), "terraforge-examples-"));
    pluginsDir = await mkdtemp(join(tmpdir(), "terraforge-installed-"));
    for (const name of ["tonal-lines", "spirograph"]) {
      await mkdir(join(examplesDir, name, "lib"), { recursive: true });
      const source = name === "spirograph" ? "none" : "required";
      await writeFile(
        join(examplesDir, name, "manifest.json"),
        `{"id":"${name}","source":"${source}"}`,
        "utf-8",
      );
      await writeFile(join(examplesDir, name, "index.js"), "module.exports.render = () => '';", "utf-8");
      await writeFile(join(examplesDir, name, "lib", "helper.js"), "exports.x = 1;", "utf-8");
    }
  });

  afterEach(async () => {
    await rm(examplesDir, { recursive: true, force: true });
    await rm(pluginsDir, { recursive: true, force: true });
  });

  it("copies a usable example, including nested files, into the plugins folder", async () => {
    const result = await installExamplePlugins(examplesDir, pluginsDir);

    expect(result.installed).toEqual(["tonal-lines"]);
    expect(result.skipped).toEqual([]);
    expect(await readFile(join(pluginsDir, "tonal-lines", "lib", "helper.js"), "utf-8")).toBe(
      "exports.x = 1;",
    );
  });

  it("holds back a generator, which has nowhere to appear in the app yet", async () => {
    const result = await installExamplePlugins(examplesDir, pluginsDir);

    expect(result.unsupported).toEqual(["spirograph"]);
    expect(existsSync(join(pluginsDir, "spirograph"))).toBe(false);
  });

  it("never overwrites an example the user has since edited", async () => {
    await mkdir(join(pluginsDir, "tonal-lines"), { recursive: true });
    await writeFile(join(pluginsDir, "tonal-lines", "index.js"), "// my changes", "utf-8");

    const result = await installExamplePlugins(examplesDir, pluginsDir);

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual(["tonal-lines"]);
    expect(await readFile(join(pluginsDir, "tonal-lines", "index.js"), "utf-8")).toBe("// my changes");
  });

  it("is safe to run twice", async () => {
    await installExamplePlugins(examplesDir, pluginsDir);
    const second = await installExamplePlugins(examplesDir, pluginsDir);

    expect(second.installed).toEqual([]);
    expect(second.skipped).toEqual(["tonal-lines"]);
  });

  it("reports a build with no examples in it rather than failing silently", async () => {
    await expect(installExamplePlugins(join(examplesDir, "nope"), pluginsDir)).rejects.toThrow(
      /missing from this build/,
    );
  });
});
