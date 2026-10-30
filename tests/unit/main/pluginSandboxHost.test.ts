import { describe, expect, it } from "vitest";
import { HOST_JS } from "../../../src/main/plugins/pluginSandboxAssets";
import {
  MAX_OUTPUT_UNITS,
  MAX_PLUGIN_MESSAGE_LENGTH,
  MAX_REQ_ID_LENGTH,
} from "../../../src/main/plugins/pluginOutputBudget";

type Message = Record<string, unknown>;

/**
 * Runs the real host page script against a stand-in bridge and Worker, so a
 * test can post from the "plugin's" side and see exactly what would cross
 * into the main process.
 */
function startHost() {
  const toMain: Message[] = [];
  let fromMain: ((message: Message) => void) | null = null;
  let worker: { onmessage?: (event: { data: unknown }) => void } | null = null;

  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: unknown;
    constructor() {
      worker = this;
    }
    postMessage(): void {}
    terminate(): void {}
  }

  const window = {
    __terraForgePluginHost: {
      send: (message: Message) => toMain.push(message),
      onMessage: (cb: (message: Message) => void) => {
        fromMain = cb;
      },
    },
  };
  new Function("window", "Worker", HOST_JS)(window, FakeWorker);
  fromMain!({ type: "init", modules: {}, entry: "index.js" });
  toMain.length = 0; // drop the page's own "page-ready"

  const post = (data: unknown): Message | undefined => {
    const before = toMain.length;
    worker!.onmessage!({ data });
    return toMain.length > before ? toMain[toMain.length - 1] : undefined;
  };
  return { post };
}

describe("sandbox host page", () => {
  it("passes well-formed worker messages through", () => {
    const { post } = startHost();
    expect(post({ type: "ready" })).toEqual({ type: "ready" });
    expect(post({ type: "result", reqId: "1", output: "M0 0" })).toEqual({ type: "result", reqId: "1", output: "M0 0" });
    expect(post({ type: "error", reqId: "2", message: "boom" })).toEqual({ type: "error", reqId: "2", message: "boom" });
  });

  it("drops message types the worker never sends, and non-objects", () => {
    const { post } = startHost();
    expect(post({ type: "page-ready" })).toBeUndefined();
    expect(post({ type: "init", modules: {} })).toBeUndefined();
    expect(post(null)).toBeUndefined();
    expect(post("ready")).toBeUndefined();
  });

  it("bounds error text and request ids", () => {
    const { post } = startHost();
    const huge = "x".repeat(MAX_PLUGIN_MESSAGE_LENGTH * 10);
    expect((post({ type: "error", reqId: "1", message: huge })?.message as string).length).toBe(
      MAX_PLUGIN_MESSAGE_LENGTH,
    );
    expect((post({ type: "load-error", message: huge })?.message as string).length).toBe(MAX_PLUGIN_MESSAGE_LENGTH);
    expect((post({ type: "result", reqId: huge, output: "M0 0" })?.reqId as string).length).toBe(MAX_REQ_ID_LENGTH);
    expect(post({ type: "error", reqId: "1", message: { length: 1 } })?.message).toBe("");
  });

  it("drops fields it does not expect", () => {
    const { post } = startHost();
    expect(post({ type: "result", reqId: "1", output: "M0 0", padding: "x".repeat(1000) })).toEqual({
      type: "result",
      reqId: "1",
      output: "M0 0",
    });
  });

  it("turns an over-budget result into an error", () => {
    const { post } = startHost();
    expect(post({ type: "result", reqId: "1", output: "x".repeat(MAX_OUTPUT_UNITS + 1) })).toMatchObject({
      type: "error",
      reqId: "1",
    });
  });
});
