import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// ── DOMMatrix polyfill for jsdom ──────────────────────────────────────────────
// jsdom does not implement DOMMatrix. Provide a minimal polyfill so that
// svgTransform.ts tests (applyMatrixToPathD / computePathsBounds) work.
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixPolyfill {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;

    constructor(
      init?: [number, number, number, number, number, number] | number[],
    ) {
      if (init && init.length >= 6) {
        this.a = init[0];
        this.b = init[1];
        this.c = init[2];
        this.d = init[3];
        this.e = init[4];
        this.f = init[5];
      } else {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }
    }

    get isIdentity(): boolean {
      return (
        this.a === 1 &&
        this.b === 0 &&
        this.c === 0 &&
        this.d === 1 &&
        this.e === 0 &&
        this.f === 0
      );
    }

    transformPoint(pt: { x: number; y: number }): { x: number; y: number } {
      return {
        x: this.a * pt.x + this.c * pt.y + this.e,
        y: this.b * pt.x + this.d * pt.y + this.f,
      };
    }

    multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
      const m = new DOMMatrixPolyfill();
      m.a = this.a * other.a + this.c * other.b;
      m.b = this.b * other.a + this.d * other.b;
      m.c = this.a * other.c + this.c * other.d;
      m.d = this.b * other.c + this.d * other.d;
      m.e = this.a * other.e + this.c * other.f + this.e;
      m.f = this.b * other.e + this.d * other.f + this.f;
      return m;
    }
  }

  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}

// ── ResizeObserver polyfill for jsdom ──────────────────────────────────────────
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    _cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this._cb = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

// ── DOM method stubs for jsdom ────────────────────────────────────────────────
// jsdom doesn't implement scrollIntoView or scrollTo
if (typeof window !== "undefined") {
  Element.prototype.scrollIntoView = function () {};
  window.scrollTo = function () {} as any;
}

// ── Mock window.terraForge API ──────────────────────────────────────────────

if (typeof window !== "undefined") {
  const mockApi = {
    fluidnc: {
      getStatus: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn().mockResolvedValue(undefined),
      listFiles: vi.fn().mockResolvedValue([]),
      listSDFiles: vi.fn().mockResolvedValue([]),
      uploadFile: vi.fn().mockResolvedValue(undefined),
      downloadFile: vi.fn().mockResolvedValue(undefined),
      fetchFileText: vi.fn().mockResolvedValue(""),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      runFile: vi.fn().mockResolvedValue(undefined),
      uploadGcode: vi.fn().mockResolvedValue(undefined),
      pauseJob: vi.fn().mockResolvedValue(undefined),
      resumeJob: vi.fn().mockResolvedValue(undefined),
      abortJob: vi.fn().mockResolvedValue(undefined),
      connectWebSocket: vi.fn().mockResolvedValue(undefined),
      disconnectWebSocket: vi.fn().mockResolvedValue(undefined),
      onStatusUpdate: vi.fn().mockReturnValue(() => {}),
      onConsoleMessage: vi.fn().mockReturnValue(() => {}),
      onPing: vi.fn().mockReturnValue(() => {}),
      onFirmwareInfo: vi.fn().mockReturnValue(() => {}),
    },
    serial: {
      listPorts: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onData: vi.fn().mockReturnValue(() => {}),
    },
    fs: {
      openSvgDialog: vi.fn().mockResolvedValue(null),
      openPdfDialog: vi.fn().mockResolvedValue(null),
      openFileDialog: vi.fn().mockResolvedValue(null),
      openGcodeDialog: vi.fn().mockResolvedValue(null),
      readFile: vi.fn().mockResolvedValue(""),
      readFileBinary: vi.fn().mockResolvedValue(new Uint8Array()),
      writeFile: vi.fn().mockResolvedValue(undefined),
      saveGcodeDialog: vi.fn().mockResolvedValue(null),
      saveFileDialog: vi.fn().mockResolvedValue(null),
      loadConfigs: vi.fn().mockResolvedValue([]),
      saveConfigs: vi.fn().mockResolvedValue(undefined),
    },
    tasks: {
      cancel: vi.fn().mockResolvedValue(undefined),
      onTaskUpdate: vi.fn().mockReturnValue(() => {}),
    },
    jobs: {
      generateGcode: vi.fn().mockResolvedValue(""),
    },
    config: {
      getMachineConfigs: vi.fn().mockResolvedValue([]),
      saveMachineConfig: vi.fn().mockResolvedValue(undefined),
      deleteMachineConfig: vi.fn().mockResolvedValue(undefined),
      exportConfigs: vi.fn().mockResolvedValue(null),
      importConfigs: vi.fn().mockResolvedValue({ added: 0, skipped: 0 }),
    },
  };
  (window as any).terraForge = mockApi;
}
