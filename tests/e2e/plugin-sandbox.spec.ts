/**
 * E2E: renderer plugin sandbox, against hostile plugins.
 *
 * The unit tests drive each layer of the sandbox (worker script, host page,
 * main-process host manager) in isolation, against stand-ins. This spec runs
 * deliberately misbehaving plugins through the real thing — a hidden
 * BrowserWindow, its CSP and session, the worker — so the guarantees hold
 * where they actually matter, and a change that only breaks them in Electron
 * cannot pass unnoticed.
 *
 * Note: on Linux the e2e launcher passes --no-sandbox, so the Chromium OS
 * sandbox is off here. What this spec covers is everything above it: CSP,
 * the session's request filter, message rebuilding and bounding, timeouts,
 * and host lifecycle.
 */
import { test, expect } from "@playwright/test";
import * as http from "http";
import type { AddressInfo } from "net";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers";

let electronApp: ElectronApplication;
let page: Page;
let userDataDir: string;
let server: http.Server;
let serverHits = 0;

function plugin(id: string, source: string, manifest: Record<string, unknown> = {}) {
  return {
    "manifest.json": JSON.stringify({
      id,
      label: id,
      apiVersion: 1,
      entry: "index.js",
      defaults: {},
      fields: [],
      ...manifest,
    }),
    "index.js": source,
  };
}

type Outcome = { ok: unknown } | { error: string } | { missing: true };

interface SourceSpec {
  id: string;
  /** Sent with its pixels when given; by id alone otherwise. */
  values?: number[];
  /** A blank image this many pixels wide, one high, built in the page. */
  blank?: number;
}

/**
 * Runs one render from the app's own window, through the public preload API.
 * Each call gets a fresh image unless `source` names one.
 */
function render(pluginId: string, settings: Record<string, number | boolean | string> = {}, source?: SourceSpec): Promise<Outcome> {
  const spec = source ?? { id: `fresh-${Math.random()}`, values: [0, 64, 128, 255] };
  return page.evaluate(
    ({ pluginId, settings, spec }) => {
      const values = spec.blank ? new Uint8Array(spec.blank) : spec.values ? new Uint8Array(spec.values) : undefined;
      const width = spec.blank ?? (spec.values ? spec.values.length : 1);
      return window.terraForge.rendererPlugins
        .render(pluginId, { width, height: 1, scale: 1, settings, source: { id: spec.id, width, height: 1, values } })
        .then(
          (result) => (result.status === "ok" ? { ok: result.output } : { missing: true as const }),
          (err: Error) => ({ error: String(err.message) }),
        );
    },
    { pluginId, settings, spec },
  );
}

/** URLs of the live plugin host windows, which the user never sees. */
function hostWindowUrls(): Promise<string[]> {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && w.webContents.getURL().startsWith("tfplugin://"))
      .map((w) => w.webContents.getURL()),
  );
}

test.beforeAll(async () => {
  server = http.createServer((_req, res) => {
    serverHits++;
    res.end("reached");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  ({ electronApp, window: page, userDataDir } = await launchApp({
    plugins: {
      "well-behaved": plugin("e2e.well-behaved", `module.exports.render = () => "M0 0 L1 1";`),

      // Honest about its shape, dishonest about its size: caught in the worker.
      oversized: plugin(
        "e2e.oversized",
        `module.exports.render = () => "M".repeat(65 * 1024 * 1024);`,
      ),

      // Replaces the worker's message handler to learn each request id, then
      // posts its own messages around the worker's size check — the attack
      // the host page's rebuilding and budget exist for.
      forged: plugin(
        "e2e.forged",
        `
        var original = self.onmessage;
        self.onmessage = function (event) {
          var message = event.data;
          if (message.type !== "render") return original(event);
          self.postMessage({ type: "page-ready" });
          self.postMessage({ type: "init", modules: {}, entry: "x" });
          self.postMessage({ type: "result", reqId: message.reqId, output: new Array(20 * 1000 * 1000) });
        };
        module.exports.render = () => "M0 0";
        `,
      ),

      // Every route out of the worker, each reported back as a render error.
      network: plugin(
        "e2e.network",
        `
        module.exports.render = async () => {
          const attempts = [];
          try { await fetch(${JSON.stringify(url)}); attempts.push("fetch reached"); }
          catch (e) { attempts.push("fetch blocked"); }
          try { importScripts(${JSON.stringify(url)}); attempts.push("importScripts reached"); }
          catch (e) { attempts.push("importScripts blocked"); }
          try { require("fs"); attempts.push("require reached"); }
          catch (e) { attempts.push("require blocked"); }
          attempts.push("process " + typeof process);
          throw new Error(attempts.join(", "));
        };
        `,
      ),

      // Hangs only when asked to, so recovery can be shown with the same plugin.
      hang: plugin(
        "e2e.hang",
        `module.exports.render = (ctx) => { if (ctx.settings.hang) for (;;) {} return "M0 0"; };`,
        { renderTimeoutMs: 1000 },
      ),

      // Sums its source, then overwrites it, as a plugin working in place would.
      summing: plugin(
        "e2e.summing",
        `module.exports.render = (ctx) => {
          const v = ctx.source.values;
          let sum = 0;
          for (let i = 0; i < v.length; i++) { sum += v[i]; v[i] = 0; }
          return "M" + sum + " 0";
        };`,
      ),

      // Busy long enough for the test to close its window mid-render.
      slow: plugin(
        "e2e.slow",
        `module.exports.render = (ctx) => {
          if (ctx.settings.slow) { const end = Date.now() + 8000; while (Date.now() < end) {} }
          return "M0 0";
        };`,
        { renderTimeoutMs: 15000 },
      ),
    },
  }));
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp, userDataDir);
  server?.close();
});

test("discovers every seeded plugin", async () => {
  const { manifests, errors } = await page.evaluate(() => window.terraForge.rendererPlugins.list());
  expect(errors).toEqual([]);
  expect(manifests.map((m) => m.id).sort()).toEqual(
    ["e2e.forged", "e2e.hang", "e2e.network", "e2e.oversized", "e2e.slow", "e2e.summing", "e2e.well-behaved"],
  );
});

test("a well-behaved plugin renders through the sandbox", async () => {
  expect(await render("e2e.well-behaved")).toEqual({ ok: "M0 0 L1 1" });
});

test("an oversized result is refused", async () => {
  const outcome = await render("e2e.oversized");
  expect(outcome).toMatchObject({ error: expect.stringMatching(/over the \d+ limit/) });
});

test("a plugin posting around the worker's checks is still bounded", async () => {
  const outcome = await render("e2e.forged");
  expect(outcome).toMatchObject({ error: expect.stringMatching(/larger than the size a plugin may return/) });
  // The forged page-ready and init were dropped, not acted on: the same host
  // windows are still alive, and they still serve the next render.
  const before = await hostIds();
  expect(await render("e2e.forged")).toMatchObject({ error: expect.stringMatching(/larger than/) });
  expect(await hostIds()).toEqual(before);
});

test("a plugin cannot reach the network, Node, or its host's process", async () => {
  const outcome = await render("e2e.network");
  expect(outcome).toEqual({
    error: expect.stringContaining("fetch blocked, importScripts blocked, require blocked, process undefined"),
  });
  expect(serverHits).toBe(0);
});

test("a hung render times out, and the same plugin serves the next one", async () => {
  expect(await render("e2e.hang", { hang: true })).toMatchObject({ error: expect.stringMatching(/timed out after 1000ms/) });
  expect(await render("e2e.hang", { hang: false })).toEqual({ ok: "M0 0" });
});

test("closing a host window mid-render rejects that render, and the plugin recovers", async () => {
  await page.evaluate(() => {
    (window as unknown as { pending: Promise<unknown> }).pending = window.terraForge.rendererPlugins
      .render("e2e.slow", {
        width: 1,
        height: 1,
        scale: 1,
        settings: { slow: true },
        source: { id: "slow-1", width: 1, height: 1, values: new Uint8Array([0]) },
      })
      .then(
        (result) => (result.status === "ok" ? { ok: result.output } : { missing: true }),
        (err: Error) => ({ error: String(err.message) }),
      );
  });

  // Wait until the render is actually in flight in a live host before closing it.
  await expect.poll(hostCount).toBeGreaterThan(0);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents.getURL().startsWith("tfplugin://")) w.destroy();
    }
  });

  const outcome = await page.evaluate(() => (window as unknown as { pending: Promise<unknown> }).pending);
  expect(outcome).toMatchObject({ error: expect.stringMatching(/closed unexpectedly/) });
  expect(await render("e2e.slow", { slow: false })).toEqual({ ok: "M0 0" });
});

test("a host window refuses to navigate away or open another window", async () => {
  await render("e2e.well-behaved");
  const result = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const host = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith("tfplugin://"))!;
    const before = BrowserWindow.getAllWindows().length;
    await host.webContents.executeJavaScript(
      `window.open("tfplugin://host/host.html"); location.href = "tfplugin://host/elsewhere"; 0`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { url: host.webContents.getURL(), added: BrowserWindow.getAllWindows().length - before };
  });
  expect(result).toEqual({ url: "tfplugin://host/host.html", added: 0 });
  expect(await render("e2e.well-behaved")).toEqual({ ok: "M0 0 L1 1" });
});

async function hostCount(): Promise<number> {
  return (await hostWindowUrls()).length;
}

function hostIds(): Promise<number[]> {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && w.webContents.getURL().startsWith("tfplugin://"))
      .map((w) => w.id)
      .sort((a, b) => a - b),
  );
}

test.describe("source images", () => {
  test("a re-render by id alone sees the original pixels, even after the plugin overwrote them", async () => {
    expect(await render("e2e.summing", {}, { id: "sum-1", values: [1, 2, 3] })).toEqual({ ok: "M6 0" });
    expect(await render("e2e.summing", { changed: true }, { id: "sum-1" })).toEqual({ ok: "M6 0" });
  });

  test("an image the main process never received is reported, not rendered", async () => {
    expect(await render("e2e.summing", {}, { id: "never-sent" })).toEqual({ missing: true });
  });

  test("a re-render by id is far cheaper than sending the pixels", async () => {
    const pixels = 25_000_000; // an A2 page at the source resolution cap
    const time = (spec: SourceSpec) =>
      page.evaluate(
        async ({ spec, pixels }) => {
          const values = spec.blank ? new Uint8Array(pixels) : undefined;
          const start = performance.now();
          await window.terraForge.rendererPlugins.render("e2e.well-behaved", {
            width: pixels,
            height: 1,
            scale: 1,
            settings: {},
            source: { id: spec.id, width: pixels, height: 1, values },
          });
          return performance.now() - start;
        },
        { spec, pixels },
      );

    const full = await time({ id: "big-1", blank: pixels });
    const byId = Math.min(await time({ id: "big-1" }), await time({ id: "big-1" }));
    expect(byId).toBeLessThan(full / 3);
  });
});
