/**
 * FluidNCClient.downloadFile(), against real files in a temporary folder.
 * Only the network is faked: `fetch` answers with a real Response whose
 * body the test feeds, ends, breaks or leaves hanging.
 *
 * What matters here is what is left on disk afterwards: the whole file, or
 * nothing new at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FluidNCClient } from "../../src/machine/fluidnc";

const mockFetch = vi.fn();
let dir: string;
let dest: string;
let client: FluidNCClient;

/** A response body the test writes to as it goes. */
function liveBody() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    body,
    push: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
    end: () => controller.close(),
    fail: (err: Error) => controller.error(err),
  };
}

/** Answers the next request with `body`, and a content-length if given. */
function respondWith(body: BodyInit | null, contentLength?: number) {
  mockFetch.mockResolvedValueOnce(
    new Response(body, { status: 200, headers: contentLength ? { "content-length": String(contentLength) } : {} }),
  );
}

/** Resolves once the download has written something to its partial file. */
const partWritten = () =>
  vi.waitFor(() => expect(readFileSync(`${dest}.part`, "utf8").length).toBeGreaterThan(0), { interval: 5 });

const setIdleTimeout = (ms: number) => ((FluidNCClient as unknown as { transferIdleTimeoutMs: number }).transferIdleTimeoutMs = ms);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "terraforge-download-"));
  dest = join(dir, "job.gcode");
  client = new FluidNCClient();
  client.setHost("192.168.1.100", 80);
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setIdleTimeout(60_000);
  rmSync(dir, { recursive: true, force: true });
});

describe("FluidNCClient.downloadFile", () => {
  it("fetches from the SD card by default and writes the whole file", async () => {
    respondWith("G0 X0\nG1 X10\n");
    await client.downloadFile("/plots/job.gcode", dest);

    expect(mockFetch.mock.calls[0][0]).toBe("http://192.168.1.100:80/sd/plots/job.gcode");
    expect(readFileSync(dest, "utf8")).toBe("G0 X0\nG1 X10\n");
    // Only the file: the partial it was written to has been moved into place.
    expect(readdirSync(dir)).toEqual(["job.gcode"]);
  });

  it("fetches from /localfs for the internal filesystem", async () => {
    respondWith("config");
    await client.downloadFile("config.yaml", dest, "internal");
    expect(mockFetch.mock.calls[0][0]).toBe("http://192.168.1.100:80/localfs/config.yaml");
    expect(readFileSync(dest, "utf8")).toBe("config");
  });

  it("reports progress as chunks arrive, and 100 only once the file is in place", async () => {
    const live = liveBody();
    respondWith(live.body, 8);
    const seen: [number, boolean][] = [];
    const done = client.downloadFile("/job.gcode", dest, "sdcard", (percent) => seen.push([percent, existsSync(dest)]));

    live.push("AAAA");
    await vi.waitFor(() => expect(seen).toEqual([[50, false]]), { interval: 5 });
    live.push("BBBB");
    live.end();
    await done;

    // All the bytes had arrived at 99; the file was only there at 100.
    expect(seen).toEqual([
      [50, false],
      [99, false],
      [100, true],
    ]);
  });

  it("reports only completion when the size is not known", async () => {
    respondWith("abc");
    const onProgress = vi.fn();
    await client.downloadFile("/job.gcode", dest, "sdcard", onProgress);
    expect(onProgress.mock.calls).toEqual([[100]]);
  });

  it("replaces an existing file", async () => {
    writeFileSync(dest, "old");
    respondWith("new");
    await client.downloadFile("/job.gcode", dest);
    expect(readFileSync(dest, "utf8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["job.gcode"]);
  });

  describe("when the download does not complete", () => {
    it("leaves nothing behind when the connection breaks part-way", async () => {
      const live = liveBody();
      respondWith(live.body, 100);
      const done = client.downloadFile("/job.gcode", dest);
      live.push("G0 X0\n");
      await partWritten();
      live.fail(new Error("socket hang up"));

      await expect(done).rejects.toThrow("socket hang up");
      expect(readdirSync(dir)).toEqual([]);
    });

    it("keeps the file it was to replace when the connection breaks part-way", async () => {
      writeFileSync(dest, "the earlier copy");
      const live = liveBody();
      respondWith(live.body, 100);
      const done = client.downloadFile("/job.gcode", dest);
      live.push("G0 X0\n");
      await partWritten();
      live.fail(new Error("socket hang up"));

      await expect(done).rejects.toThrow("socket hang up");
      expect(readFileSync(dest, "utf8")).toBe("the earlier copy");
      expect(readdirSync(dir)).toEqual(["job.gcode"]);
    });

    it("leaves nothing behind when cancelled part-way", async () => {
      const live = liveBody();
      respondWith(live.body, 100);
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const done = client.downloadFile("/job.gcode", dest, "sdcard", undefined, controller.signal);
      live.push("G0 X0\n");
      await partWritten();
      controller.abort();

      await expect(done).rejects.toThrow("Download cancelled");
      expect(readdirSync(dir)).toEqual([]);
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    });

    it("does not start when already cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(client.downloadFile("/job.gcode", dest, "sdcard", undefined, controller.signal)).rejects.toThrow(
        "Download cancelled",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("gives up a download that stops arriving", async () => {
      setIdleTimeout(40);
      const live = liveBody();
      respondWith(live.body, 100);
      const done = client.downloadFile("/job.gcode", dest);
      live.push("G0 X0\n");
      // ...and then nothing more.

      await expect(done).rejects.toThrow("Download stalled: no data received for 0 s");
      expect(readdirSync(dir)).toEqual([]);
    });

    it("gives up a request that is never answered", async () => {
      setIdleTimeout(40);
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
      );
      await expect(client.downloadFile("/job.gcode", dest)).rejects.toThrow(/^Download stalled/);
      expect(readdirSync(dir)).toEqual([]);
    });

    it("does not time out a download that keeps arriving", async () => {
      setIdleTimeout(250);
      const live = liveBody();
      respondWith(live.body);
      const done = client.downloadFile("/job.gcode", dest);
      // Longer in all than the idle limit, but never idle for that long.
      for (const part of ["a", "b", "c", "d", "e"]) {
        live.push(part);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      live.end();
      await done;
      expect(readFileSync(dest, "utf8")).toBe("abcde");
    });

    it("rejects when the machine refuses the file, without touching the disk", async () => {
      writeFileSync(dest, "the earlier copy");
      mockFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));
      await expect(client.downloadFile("/missing.gcode", dest)).rejects.toThrow("HTTP 404");
      expect(readFileSync(dest, "utf8")).toBe("the earlier copy");
      expect(readdirSync(dir)).toEqual(["job.gcode"]);
    });

    it("rejects when the response has no body", async () => {
      respondWith(null);
      await expect(client.downloadFile("/job.gcode", dest)).rejects.toThrow("No response body");
      expect(readdirSync(dir)).toEqual([]);
    });

    it("rejects when the file cannot be written", async () => {
      respondWith("G0 X0\n");
      await expect(client.downloadFile("/job.gcode", join(dir, "no-such-folder", "job.gcode"))).rejects.toThrow(/ENOENT/);
      expect(readdirSync(dir)).toEqual([]);
    });
  });
});
