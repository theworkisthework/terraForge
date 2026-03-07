/**
 * fluidncUpload.test.ts – Node environment (see vitest.config.ts globs)
 *
 * Tests FluidNCClient.uploadFile() and FluidNCClient.downloadFile() in isolation.
 * The fs / fs/promises / form-data modules are mocked so no real file I/O occurs.
 *
 * IMPORTANT – Vitest hoisting:
 *   vi.mock() factories are hoisted to the very top of the compiled output,
 *   before any module-level `const` declarations.  To share vi.fn() singletons
 *   between the factory and the test body we use vi.hoisted() for the fn refs,
 *   and a globalThis "state bag" for the mutable per-test values (submitError,
 *   statusCode, latestFormInstance) that the FormData mock reads at call-time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── 1. Create singleton fn references that survive hoisting ─────────────────
const { mockCreateReadStream, mockCreateWriteStream, mockReadStream } =
  vi.hoisted(() => {
    const _mockReadStream = {
      on: vi.fn((event: string, handler: unknown) => {
        if (event === "data") {
          // Publish the handler to globalThis so tests can fire it manually.
          (globalThis as Record<string, unknown>).__dataHandler = handler;
        }
        return _mockReadStream;
      }),
    };
    return {
      mockReadStream: _mockReadStream,
      mockCreateReadStream: vi.fn(() => _mockReadStream),
      mockCreateWriteStream: vi.fn(() => ({
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      })),
    };
  });

// ── 2. vi.mock declarations (hoisted by Vitest, but can access vi.hoisted vars)

vi.mock("form-data", () => {
  /** Real function keyword required – arrow fns can't be used with `new`. */
  function MockFormData(this: unknown) {
    // Read mutable state from the globalThis bag (set in beforeEach).
    const bag = (globalThis as Record<string, unknown>).__uploadState as
      | UploadState
      | undefined;
    const submitError = bag?.submitError ?? null;
    const submitStatusCode = bag?.submitStatusCode ?? 200;

    const inst = {
      append: vi.fn(),
      submit: vi.fn(
        (url: string, cb: (err: Error | null, res: unknown) => void) => {
          if (submitError) {
            cb(submitError, null);
            return;
          }
          const res = {
            statusCode: submitStatusCode,
            resume: vi.fn(),
            on: vi.fn((_event: string, handler: () => void) => {
              if (_event === "end") setTimeout(handler, 0);
            }),
          };
          cb(null, res);
        },
      ),
    };
    // Publish instance so tests can inspect appended values.
    if (bag) bag.latestFormInstance = inst;
    return inst;
  }
  return { default: MockFormData };
});

vi.mock("fs/promises", () => ({
  default: {
    stat: vi.fn(async () => ({
      size:
        ((globalThis as Record<string, unknown>).__statSize as
          | number
          | undefined) ?? 1024,
    })),
  },
  stat: vi.fn(async () => ({
    size:
      ((globalThis as Record<string, unknown>).__statSize as
        | number
        | undefined) ?? 1024,
  })),
}));

vi.mock("fs", () => ({
  default: {
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
  },
  createReadStream: mockCreateReadStream,
  createWriteStream: mockCreateWriteStream,
}));

// ── 3. Import module under test AFTER all vi.mock calls ─────────────────────
import { FluidNCClient } from "../../src/machine/fluidnc";

// ── Types / helpers ──────────────────────────────────────────────────────────

interface UploadState {
  submitError: Error | null;
  submitStatusCode: number;
  latestFormInstance: {
    append: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
  } | null;
}

function getState(): UploadState {
  return (globalThis as Record<string, unknown>).__uploadState as UploadState;
}

function buildClient(): FluidNCClient {
  const c = new FluidNCClient();
  c.setHost("192.168.1.100", 80);
  return c;
}

/** Build a mock fetch Response suitable for downloadFile. */
function mockDownloadResponse(
  chunks: Uint8Array[],
  contentLength = 0,
): Response {
  let idx = 0;
  const reader = {
    read: vi.fn(async () => {
      if (idx >= chunks.length)
        return { done: true as const, value: undefined };
      return { done: false as const, value: chunks[idx++] };
    }),
  };
  return {
    ok: true,
    status: 200,
    headers: new Headers([["content-length", String(contentLength)]]),
    body: { getReader: () => reader },
    text: async () => "",
    json: async () => ({}),
  } as unknown as Response;
}

// ── 4. Setup / teardown ──────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  // Reset per-test mutable state bag
  (globalThis as Record<string, unknown>).__uploadState = {
    submitError: null,
    submitStatusCode: 200,
    latestFormInstance: null,
  } satisfies UploadState;
  (globalThis as Record<string, unknown>).__statSize = 1024;
  (globalThis as Record<string, unknown>).__dataHandler = null;

  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  mockReadStream.on.mockClear();
  mockCreateReadStream.mockClear();
  mockCreateWriteStream.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── uploadFile ───────────────────────────────────────────────────────────────

describe("FluidNCClient.uploadFile", () => {
  it("resolves successfully on HTTP 200", async () => {
    const client = buildClient();
    await expect(
      client.uploadFile("/local/test.gcode", "/sd/", undefined, "test.gcode"),
    ).resolves.toBeUndefined();
  });

  it("calls onProgress with 100 when upload succeeds", async () => {
    const client = buildClient();
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
    (globalThis as Record<string, unknown>).__statSize = 1000;
    const client = buildClient();
    const onProgress = vi.fn();

    const uploadPromise = client.uploadFile(
      "/local/test.gcode",
      "/sd/",
      onProgress,
    );

    // Fire a 500-byte chunk (50 % of 1000) if handler was registered
    const handler = (globalThis as Record<string, unknown>).__dataHandler as
      | ((chunk: Buffer) => void)
      | null;
    if (handler) handler(Buffer.alloc(500));

    await uploadPromise;
    const calls = onProgress.mock.calls.map(([p]) => p as number);
    expect(calls).toContain(100);
    if (calls.length > 1) expect(calls).toContain(50);
  });

  it("rejects when HTTP response status is >= 400", async () => {
    getState().submitStatusCode = 404;
    const client = buildClient();
    await expect(
      client.uploadFile("/local/test.gcode", "/sd/"),
    ).rejects.toThrow("HTTP 404");
  });

  it("rejects when form.submit reports a network error", async () => {
    getState().submitError = new Error("ECONNREFUSED");
    const client = buildClient();
    await expect(
      client.uploadFile("/local/test.gcode", "/sd/"),
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("opens the read stream from the local path (not the remote filename)", async () => {
    const client = buildClient();
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
    await client.uploadFile("/local/test.gcode", "/sd/dest/");
    const form = getState().latestFormInstance;
    expect(form).not.toBeNull();
    expect(form!.append).toHaveBeenCalledWith("path", "/sd/dest/");
    expect(form!.append).toHaveBeenCalledWith(
      "file",
      expect.anything(),
      expect.objectContaining({ knownLength: 1024 }),
    );
  });
});

// ── downloadFile ─────────────────────────────────────────────────────────────

describe("FluidNCClient.downloadFile", () => {
  it("fetches from /sd/ prefix for sdcard filesystem", async () => {
    const chunk = new Uint8Array([71, 48, 32, 88, 48]);
    mockFetch.mockResolvedValueOnce(
      mockDownloadResponse([chunk], chunk.length),
    );
    const client = buildClient();
    await client.downloadFile("/test.gcode", "/local/test.gcode", "sdcard");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/sd/test.gcode"),
      expect.any(Object),
    );
  });

  it("fetches from /localfs/ prefix for internal filesystem", async () => {
    const chunk = new Uint8Array([99]);
    mockFetch.mockResolvedValueOnce(
      mockDownloadResponse([chunk], chunk.length),
    );
    const client = buildClient();
    await client.downloadFile("/config.yaml", "/local/config.yaml", "internal");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/localfs/config.yaml"),
      expect.any(Object),
    );
  });

  it("calls onProgress with 100 when download completes", async () => {
    const chunk = new Uint8Array([1, 2, 3, 4]);
    mockFetch.mockResolvedValueOnce(
      mockDownloadResponse([chunk], chunk.length),
    );
    const client = buildClient();
    const onProgress = vi.fn();
    await client.downloadFile(
      "/file.gcode",
      "/local/file.gcode",
      "sdcard",
      onProgress,
    );
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("reports intermediate progress as chunks arrive", async () => {
    const chunk1 = new Uint8Array(512);
    const chunk2 = new Uint8Array(512);
    mockFetch.mockResolvedValueOnce(
      mockDownloadResponse([chunk1, chunk2], 1024),
    );
    const client = buildClient();
    const onProgress = vi.fn();
    await client.downloadFile(
      "/file.gcode",
      "/local/file.gcode",
      "sdcard",
      onProgress,
    );
    const calls = onProgress.mock.calls.map(([p]) => p as number);
    expect(calls).toContain(100);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("writes received chunks to the WriteStream", async () => {
    const chunk = new Uint8Array([71, 48]); // "G0"
    mockFetch.mockResolvedValueOnce(
      mockDownloadResponse([chunk], chunk.length),
    );
    const client = buildClient();
    await client.downloadFile("/file.gcode", "/local/file.gcode");
    const writerResult =
      mockCreateWriteStream.mock.results[
        mockCreateWriteStream.mock.results.length - 1
      ];
    const writer = writerResult?.value as {
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };
    expect(writer).toBeDefined();
    expect(writer.write).toHaveBeenCalledWith(chunk);
    expect(writer.end).toHaveBeenCalled();
  });

  it("throws when response body has no reader", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
      text: async () => "",
      json: async () => ({}),
    } as unknown as Response);
    const client = buildClient();
    await expect(
      client.downloadFile("/file.gcode", "/local/file.gcode"),
    ).rejects.toThrow("No response body");
  });
});
