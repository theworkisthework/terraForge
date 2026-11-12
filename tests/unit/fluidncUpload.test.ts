/**
 * fluidncUpload.test.ts
 *
 * Tests FluidNCClient.uploadFile() in isolation. The fs / fs/promises /
 * form-data modules are mocked so no real file I/O or HTTP occurs: the read
 * stream, the request and the response are bare event emitters that the
 * tests drive. (downloadFile is tested against real files, in
 * fluidncDownload.test.ts.)
 *
 * IMPORTANT – Vitest hoisting:
 *   vi.mock() factories are hoisted to the very top of the compiled output,
 *   before any module-level `const` declarations. What the factories and the
 *   tests share is therefore created in vi.hoisted().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── 1. What the mocks and the tests share ───────────────────────────────────
const { state, makeEmitter, mockCreateReadStream } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  /** As much of an EventEmitter as the code under test uses. */
  function makeEmitter<T extends object>(extra: T) {
    const listeners = new Map<string, Listener[]>();
    const emitter = {
      on(event: string, listener: Listener) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return emitter;
      },
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) listener(...args);
      },
      listenerCount: (event: string) => listeners.get(event)?.length ?? 0,
      ...extra,
    };
    return emitter;
  }
  type Emitter = ReturnType<typeof makeEmitter>;

  const state = {
    /** What the controller does with the upload. */
    reply: "ok" as
      | "ok" // answers with `statusCode`
      | "refused" // the request fails before any response
      | "silent" // never answers
      | "dropped" // starts to answer, then the connection closes
      | "response-error", // starts to answer, then the response errors
    statusCode: 200,
    statSize: 1024,
    /** The latest upload's parts. */
    stream: null as (Emitter & { destroy: ReturnType<typeof vi.fn> }) | null,
    form: null as (Emitter & { append: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> }) | null,
    request: null as
      | (Emitter & { destroy: ReturnType<typeof vi.fn>; setTimeout: ReturnType<typeof vi.fn> })
      | null,
  };
  const mockCreateReadStream = vi.fn((_path: string) => {
    state.stream = makeEmitter({ destroy: vi.fn() });
    return state.stream;
  });
  return { state, makeEmitter, mockCreateReadStream };
});

// ── 2. vi.mock declarations (hoisted by Vitest, but can access vi.hoisted vars)

vi.mock("form-data", () => {
  /** Real function keyword required – arrow fns can't be used with `new`. */
  function MockFormData(this: unknown) {
    const form = makeEmitter({
      append: vi.fn(),
      submit: vi.fn((_url: string, cb: (err: Error | null, res: unknown) => void) => {
        const request = makeEmitter({ destroy: vi.fn(), setTimeout: vi.fn() });
        state.request = request;
        const { reply, statusCode } = state;
        if (reply === "silent") return request;
        setTimeout(() => {
          if (reply === "refused") return cb(new Error("ECONNREFUSED"), null);
          const res = makeEmitter({ statusCode, complete: false, resume: vi.fn() });
          cb(null, res);
          setTimeout(() => {
            if (reply === "response-error") return res.emit("error", new Error("ECONNRESET"));
            if (reply === "ok") {
              res.complete = true;
              res.emit("end");
            }
            res.emit("close");
          }, 0);
        }, 0);
        return request;
      }),
    });
    state.form = form;
    return form;
  }
  return { default: MockFormData };
});

vi.mock("fs/promises", () => {
  const stat = vi.fn(async () => ({ size: state.statSize }));
  return { default: { stat }, stat, rename: vi.fn(), rm: vi.fn() };
});

vi.mock("fs", () => {
  const createWriteStream = vi.fn();
  return {
    default: { createReadStream: mockCreateReadStream, createWriteStream },
    createReadStream: mockCreateReadStream,
    createWriteStream,
  };
});

// ── 3. Import module under test AFTER all vi.mock calls ─────────────────────
import { FluidNCClient } from "../../src/machine/fluidnc";

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildClient(): FluidNCClient {
  const c = new FluidNCClient();
  c.setHost("192.168.1.100", 80);
  return c;
}

function mockUploadVerification(
  client: FluidNCClient,
  size: number,
  names: string[] = ["test.gcode", "my-file.gcode", "job.gcode"],
): void {
  vi.spyOn(client, "listSDFiles").mockResolvedValue(
    names.map((name) => ({
      name,
      path: `/sd/${name}`,
      size,
      isDirectory: false,
    })),
  );
  vi.spyOn(client, "listFiles").mockResolvedValue([]);
}

/**
 * Resolves once the upload's request has been made — which is a few
 * microtasks after it starts, and before the mock controller's reply, which
 * waits for a timer.
 */
async function requestMade() {
  for (let turn = 0; turn < 50 && !state.request; turn++) await Promise.resolve();
  expect(state.request).not.toBeNull();
}

// ── 4. Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  Object.assign(state, { reply: "ok", statusCode: 200, statSize: 1024, stream: null, form: null, request: null });
  mockCreateReadStream.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── uploadFile ───────────────────────────────────────────────────────────────

describe("FluidNCClient.uploadFile", () => {
  it("resolves successfully on HTTP 200", async () => {
    const client = buildClient();
    mockUploadVerification(client, 1024);
    await expect(
      client.uploadFile("/local/test.gcode", "/sd/", undefined, "test.gcode"),
    ).resolves.toBeUndefined();
  });

  it("calls onProgress with 100 when upload succeeds", async () => {
    const client = buildClient();
    mockUploadVerification(client, 1024);
    const onProgress = vi.fn();
    await client.uploadFile(
      "/local/test.gcode",
      "/sd/",
      onProgress,
      "test.gcode",
    );
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("tracks intermediate progress via stream data events", async () => {
    state.statSize = 1000;
    const client = buildClient();
    mockUploadVerification(client, 1000);
    const onProgress = vi.fn();

    const uploadPromise = client.uploadFile(
      "/local/test.gcode",
      "/sd/",
      onProgress,
    );
    await requestMade();
    // Half the file read: bytes read count for 95% of the bar, the check
    // that they arrived for the rest.
    state.stream!.emit("data", Buffer.alloc(500));

    await uploadPromise;
    expect(onProgress.mock.calls.map(([p]) => p as number)).toEqual([48, 100]);
  });

  it("tracks progress for non-buffer stream chunks", async () => {
    state.statSize = 3;
    const client = buildClient();
    mockUploadVerification(client, 3);
    const onProgress = vi.fn();

    const uploadPromise = client.uploadFile(
      "/local/test.gcode",
      "/sd/",
      onProgress,
    );
    await requestMade();
    state.stream!.emit("data", "abc");

    await uploadPromise;
    expect(onProgress.mock.calls.map(([p]) => p as number)).toEqual([95, 100]);
  });

  it("rejects when HTTP response status is >= 400", async () => {
    state.statusCode = 404;
    const client = buildClient();
    await expect(
      client.uploadFile("/local/test.gcode", "/sd/"),
    ).rejects.toThrow("HTTP 404");
  });

  it("rejects when form.submit reports a network error", async () => {
    state.reply = "refused";
    const client = buildClient();
    await expect(
      client.uploadFile("/local/test.gcode", "/sd/"),
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("opens the read stream from the local path (not the remote filename)", async () => {
    const client = buildClient();
    mockUploadVerification(client, 1024, ["job.gcode"]);
    await client.uploadFile(
      "/local/path/my-file.gcode",
      "/sd/",
      undefined,
      "job.gcode",
    );
    expect(mockCreateReadStream).toHaveBeenCalledWith(
      "/local/path/my-file.gcode",
    );
  });

  it("appends path and file to FormData", async () => {
    const client = buildClient();
    mockUploadVerification(client, 1024);
    await client.uploadFile("/local/test.gcode", "/sd/dest/");
    const form = state.form;
    expect(form).not.toBeNull();
    expect(form!.append).toHaveBeenCalledWith("path", "/sd/dest/");
    expect(form!.append).toHaveBeenCalledWith(
      "file",
      expect.anything(),
      expect.objectContaining({ knownLength: 1024 }),
    );
  });

  it("splits full remote path into directory and filename", async () => {
    const client = buildClient();
    mockUploadVerification(client, 1024, ["job.gcode"]);
    await client.uploadFile("/local/test.gcode", "/sd/dest/job.gcode");

    const form = state.form;
    expect(form).not.toBeNull();
    expect(form!.append).toHaveBeenCalledWith("path", "/sd/dest");
    expect(form!.append).toHaveBeenCalledWith(
      "file",
      expect.anything(),
      expect.objectContaining({ filename: "job.gcode" }),
    );
  });

  it("rejects when post-upload size verification mismatches", async () => {
    const client = buildClient();
    vi.spyOn(client, "listSDFiles").mockResolvedValue([
      {
        name: "test.gcode",
        path: "/sd/test.gcode",
        size: 512,
        isDirectory: false,
      },
    ]);
    vi.spyOn(client, "listFiles").mockResolvedValue([]);

    // Verification retries with growing delays (seconds in total) before
    // giving up; fast-forward through them rather than wait them out — the
    // real wait came close to the 5s test timeout under coverage in CI.
    vi.useFakeTimers();
    try {
      const result = expect(
        client.uploadFile("/local/test.gcode", "/sd/test.gcode"),
      ).rejects.toThrow("expected 1024 bytes, got 512 bytes");
      await vi.runAllTimersAsync();
      await result;
      // It retried rather than failing on the first mismatch.
      expect(client.listSDFiles).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Failures that used to hang the upload, or go unhandled ────────────────

  describe("when the upload does not go through", () => {
    /** Starts an upload that will fail, and collects its outcome. */
    async function failingUpload(signal?: AbortSignal) {
      const client = buildClient();
      mockUploadVerification(client, 1024);
      const outcome = client.uploadFile("/local/test.gcode", "/sd/", undefined, "test.gcode", signal).then(
        () => null,
        (err: Error) => err,
      );
      await requestMade();
      return { client, outcome };
    }

    /** Nothing is left reading the file or holding the connection. */
    const expectTornDown = () => {
      expect(state.stream!.destroy).toHaveBeenCalled();
      expect(state.request!.destroy).toHaveBeenCalled();
    };

    it("rejects when the local file cannot be read", async () => {
      state.reply = "silent";
      const { client, outcome } = await failingUpload();
      state.stream!.emit("error", new Error("EIO: i/o error, read"));

      expect((await outcome)?.message).toBe("EIO: i/o error, read");
      expectTornDown();
      expect(client.listSDFiles).not.toHaveBeenCalled();
    });

    it("rejects when form-data reports an error", async () => {
      state.reply = "silent";
      const { outcome } = await failingUpload();
      state.form!.emit("error", new Error("form broke"));
      expect((await outcome)?.message).toBe("form broke");
    });

    it("rejects when the connection closes before the machine has replied in full", async () => {
      state.reply = "dropped";
      const { client, outcome } = await failingUpload();

      expect((await outcome)?.message).toMatch(/connection closed before the machine replied/);
      expectTornDown();
      expect(client.listSDFiles).not.toHaveBeenCalled();
    });

    it("rejects when the response errors", async () => {
      state.reply = "response-error";
      const { outcome } = await failingUpload();
      expect((await outcome)?.message).toBe("ECONNRESET");
    });

    it("listens for request errors itself, as form-data stops once the response begins", async () => {
      state.reply = "silent";
      const { outcome } = await failingUpload();
      expect(state.request!.listenerCount("error")).toBe(1);
      state.request!.emit("error", new Error("socket hang up"));
      expect((await outcome)?.message).toBe("socket hang up");
    });

    it("gives up an upload whose connection has gone quiet", async () => {
      state.reply = "silent";
      const { outcome } = await failingUpload();

      const [idleMs, onIdle] = state.request!.setTimeout.mock.calls[0] as [number, () => void];
      expect(idleMs).toBe(60_000);
      onIdle();

      expect((await outcome)?.message).toBe("Upload stalled: no data moved for 60 s");
      expectTornDown();
    });

    it("stops when cancelled, and stops listening for the cancel", async () => {
      state.reply = "silent";
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const { outcome } = await failingUpload(controller.signal);
      controller.abort();

      expect((await outcome)?.message).toBe("Upload cancelled");
      expectTornDown();
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    });

    it("does not start when already cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(buildClient().uploadFile("/local/test.gcode", "/sd/", undefined, undefined, controller.signal)).rejects.toThrow(
        "Upload cancelled",
      );
      expect(state.request).toBeNull();
    });

    it("reports only the first thing to go wrong", async () => {
      state.reply = "silent";
      const { outcome } = await failingUpload();
      state.request!.emit("error", new Error("first"));
      state.request!.emit("error", new Error("second"));
      state.stream!.emit("error", new Error("third"));
      expect((await outcome)?.message).toBe("first");
    });
  });
});
