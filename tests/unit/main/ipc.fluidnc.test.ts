import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      mocks.handlers.set(channel, fn);
    }),
  },
}));

import { registerFluidncIpcHandlers } from "../../../src/main/ipc/fluidnc";

describe("registerFluidncIpcHandlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
  });

  function buildDeps() {
    let connectionType: "wifi" | "serial" | null = null;

    const fluidnc = {
      getStatus: vi.fn(),
      sendCommand: vi.fn(),
      listFiles: vi.fn(),
      listSDFiles: vi.fn(),
      fetchFileText: vi.fn(),
      deleteFile: vi.fn(),
      runFile: vi.fn(),
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
      abortJob: vi.fn(),
      connectWebSocket: vi.fn(),
      disconnectWebSocket: vi.fn(),
      uploadFile: vi.fn(),
      downloadFile: vi.fn(),
    };

    const serialListeners = new Map<string, (...args: any[]) => void>();
    const serial = {
      on: vi.fn((event: string, fn: (...args: any[]) => void) => {
        serialListeners.set(event, fn);
      }),
      sendCommand: vi.fn(),
      listFiles: vi.fn(),
      listSDFiles: vi.fn(),
      fetchFileText: vi.fn(),
      deleteFile: vi.fn(),
      runFile: vi.fn(),
      sendRealtime: vi.fn(),
      listPorts: vi.fn(),
      connect: vi.fn(),
      startStatusPolling: vi.fn(),
      stopStatusPolling: vi.fn(),
      disconnect: vi.fn(),
      send: vi.fn(),
    };

    const taskManager = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn((id: string) => ({ id })),
      complete: vi.fn(),
      fail: vi.fn(),
      isCancelled: vi.fn(() => false),
      registerCancelHandler: vi.fn(),
      clearCancelHandler: vi.fn(),
    };

    const safeSend = vi.fn();
    const setConnectionType = vi.fn((type: "wifi" | "serial" | null) => {
      connectionType = type;
    });

    registerFluidncIpcHandlers({
      fluidnc: fluidnc as any,
      serial: serial as any,
      getConnectionType: () => connectionType,
      setConnectionType,
      safeSend,
      taskManager: taskManager as any,
    });

    return {
      fluidnc,
      serial,
      taskManager,
      safeSend,
      setConnectionType,
      setCurrentType: (type: "wifi" | "serial" | null) => {
        connectionType = type;
      },
      emitSerial: (event: string, ...args: unknown[]) =>
        serialListeners.get(event)?.(...args),
    };
  }

  it("routes getStatus to serial when connection is serial, otherwise to fluidnc", async () => {
    const deps = buildDeps();

    deps.setCurrentType("serial");
    await mocks.handlers.get("fluidnc:getStatus")?.();
    expect(deps.serial.sendCommand).toHaveBeenCalledWith("?");

    deps.setCurrentType("wifi");
    await mocks.handlers.get("fluidnc:getStatus")?.();
    expect(deps.fluidnc.getStatus).toHaveBeenCalled();
  });

  it("routes commands and file operations to the active transport, with each one's defaults", async () => {
    const deps = buildDeps();
    const call = (channel: string, ...args: unknown[]) => mocks.handlers.get(channel)?.({}, ...args);

    deps.setCurrentType(null);
    await expect(call("fluidnc:sendCommand", "$H")).rejects.toThrow("Not connected");

    deps.setCurrentType("serial");
    await call("fluidnc:sendCommand", "$H");
    await call("fluidnc:listFiles", "/a");
    await call("fluidnc:listSDFiles", "/b");
    await call("fluidnc:fetchFileText", "/c.gcode", "sdcard");
    await call("fluidnc:deleteFile", "/d.gcode");
    await call("fluidnc:runFile", "/e.gcode");
    expect(deps.serial.sendCommand).toHaveBeenCalledWith("$H");
    expect(deps.serial.listFiles).toHaveBeenCalledWith("/a");
    expect(deps.serial.listSDFiles).toHaveBeenCalledWith("/b");
    expect(deps.serial.fetchFileText).toHaveBeenCalledWith("/c.gcode", "sdcard");
    expect(deps.serial.deleteFile).toHaveBeenCalledWith("/d.gcode", "sd");
    expect(deps.serial.runFile).toHaveBeenCalledWith("/e.gcode", "sd");

    deps.setCurrentType("wifi");
    await call("fluidnc:sendCommand", "$H");
    await call("fluidnc:listFiles", "/a");
    await call("fluidnc:listSDFiles", "/b");
    await call("fluidnc:fetchFileText", "/c.gcode");
    await call("fluidnc:deleteFile", "/d.gcode");
    await call("fluidnc:runFile", "/e.gcode");
    expect(deps.fluidnc.sendCommand).toHaveBeenCalledWith("$H");
    expect(deps.fluidnc.listFiles).toHaveBeenCalledWith("/a");
    expect(deps.fluidnc.listSDFiles).toHaveBeenCalledWith("/b");
    expect(deps.fluidnc.fetchFileText).toHaveBeenCalledWith("/c.gcode", undefined);
    expect(deps.fluidnc.deleteFile).toHaveBeenCalledWith("/d.gcode", "fs");
    expect(deps.fluidnc.runFile).toHaveBeenCalledWith("/e.gcode", undefined);
  });

  it("sends realtime controls over serial transport", async () => {
    const deps = buildDeps();
    deps.setCurrentType("serial");

    await mocks.handlers.get("fluidnc:pauseJob")?.();
    await mocks.handlers.get("fluidnc:resumeJob")?.();
    await mocks.handlers.get("fluidnc:abortJob")?.();

    expect(deps.serial.sendRealtime).toHaveBeenNthCalledWith(1, "!");
    expect(deps.serial.sendRealtime).toHaveBeenNthCalledWith(2, "~");
    expect(deps.serial.sendRealtime).toHaveBeenNthCalledWith(3, "\x18");
    expect(deps.fluidnc.pauseJob).not.toHaveBeenCalled();
    expect(deps.fluidnc.resumeJob).not.toHaveBeenCalled();
    expect(deps.fluidnc.abortJob).not.toHaveBeenCalled();
  });

  it("calls FluidNC pause/resume/abort on wifi transport", async () => {
    const deps = buildDeps();
    deps.setCurrentType("wifi");

    await mocks.handlers.get("fluidnc:pauseJob")?.();
    await mocks.handlers.get("fluidnc:resumeJob")?.();
    await mocks.handlers.get("fluidnc:abortJob")?.();

    expect(deps.fluidnc.pauseJob).toHaveBeenCalledTimes(1);
    expect(deps.fluidnc.resumeJob).toHaveBeenCalledTimes(1);
    expect(deps.fluidnc.abortJob).toHaveBeenCalledTimes(1);
    expect(deps.serial.sendRealtime).not.toHaveBeenCalled();
  });

  it("rejects pause/resume/abort when nothing is connected", async () => {
    const deps = buildDeps();
    deps.setCurrentType(null);

    for (const channel of ["fluidnc:pauseJob", "fluidnc:resumeJob", "fluidnc:abortJob"]) {
      await expect(mocks.handlers.get(channel)?.()).rejects.toThrow("Not connected");
    }

    expect(deps.serial.sendRealtime).not.toHaveBeenCalled();
    expect(deps.fluidnc.pauseJob).not.toHaveBeenCalled();
    expect(deps.fluidnc.resumeJob).not.toHaveBeenCalled();
    expect(deps.fluidnc.abortJob).not.toHaveBeenCalled();
  });

  it("passes on a job control that could not be sent", async () => {
    const deps = buildDeps();

    deps.setCurrentType("serial");
    deps.serial.sendRealtime.mockRejectedValue(new Error("Serial port not connected"));
    await expect(mocks.handlers.get("fluidnc:abortJob")?.()).rejects.toThrow("Serial port not connected");

    deps.setCurrentType("wifi");
    deps.fluidnc.pauseJob.mockRejectedValue(new Error("fetch failed"));
    await expect(mocks.handlers.get("fluidnc:pauseJob")?.()).rejects.toThrow("fetch failed");
  });

  it("tells the renderer when the serial port is lost", async () => {
    const deps = buildDeps();
    await mocks.handlers.get("serial:connect")?.({}, "COM3", 115200);
    deps.setConnectionType.mockClear();

    deps.emitSerial("disconnected", "device unplugged");

    expect(deps.setConnectionType).toHaveBeenCalledWith(null);
    expect(deps.safeSend).toHaveBeenCalledWith("serial:disconnected", "device unplugged");
    expect(deps.safeSend).toHaveBeenCalledWith("serial:data", expect.stringContaining("device unplugged"));
    // With no transport left, a control is refused rather than dropped.
    await expect(mocks.handlers.get("fluidnc:pauseJob")?.()).rejects.toThrow("Not connected");
  });

  it("leaves a Wi-Fi connection alone when a stale serial port closes", () => {
    const deps = buildDeps();
    deps.setCurrentType("wifi");

    deps.emitSerial("disconnected", "port closed");

    expect(deps.setConnectionType).not.toHaveBeenCalled();
  });

  it("updates connection state for websocket connect and disconnect", async () => {
    const deps = buildDeps();

    await mocks.handlers.get("fluidnc:connectWebSocket")?.({}, "host", 80, 81);
    await mocks.handlers.get("fluidnc:disconnectWebSocket")?.();

    expect(deps.setConnectionType).toHaveBeenNthCalledWith(1, "wifi");
    expect(deps.fluidnc.connectWebSocket).toHaveBeenCalledWith("host", 80, 81);
    expect(deps.setConnectionType).toHaveBeenNthCalledWith(2, null);
    expect(deps.fluidnc.disconnectWebSocket).toHaveBeenCalled();
  });

  it("serial connect/disconnect handlers manage polling and status messaging", async () => {
    const deps = buildDeps();

    await mocks.handlers.get("serial:connect")?.({}, "COM3", 115200);
    await mocks.handlers.get("serial:disconnect")?.();

    expect(deps.serial.connect).toHaveBeenCalledWith("COM3", 115200);
    expect(deps.setConnectionType).toHaveBeenCalledWith("serial");
    expect(deps.serial.startStatusPolling).toHaveBeenCalledWith(500);
    expect(deps.safeSend).toHaveBeenCalledWith(
      "serial:data",
      expect.stringContaining("COM3"),
    );
    expect(deps.serial.stopStatusPolling).toHaveBeenCalled();
    expect(deps.setConnectionType).toHaveBeenCalledWith(null);
    expect(deps.serial.disconnect).toHaveBeenCalled();
  });

  it("reports task progress and completion for uploadGcode", async () => {
    const deps = buildDeps();
    deps.fluidnc.uploadFile.mockImplementation(
      async (
        _localPath: string,
        _remotePath: string,
        onProgress: (progress: number) => void,
      ) => {
        onProgress(50);
      },
    );

    await mocks.handlers.get("fluidnc:uploadGcode")?.(
      {},
      "task-1",
      "G1 X10",
      "/sd/job.gcode",
    );

    expect(deps.taskManager.create).toHaveBeenCalledWith(
      "task-1",
      "file-upload",
      "Uploading job.gcode",
    );
    expect(deps.fluidnc.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining("job.gcode"),
      "/sd/job.gcode",
      expect.any(Function),
      "job.gcode",
      expect.any(Object),
    );
    expect(deps.taskManager.update).toHaveBeenCalledWith("task-1", {
      progress: 50,
    });
    expect(deps.taskManager.complete).toHaveBeenCalledWith("task-1");
    expect(deps.safeSend).toHaveBeenCalledWith("task:update", { id: "task-1" });
  });

  it("marks uploadGcode failures and rethrows the error", async () => {
    const deps = buildDeps();
    deps.fluidnc.uploadFile.mockRejectedValue(new Error("upload failed"));

    await expect(
      mocks.handlers.get("fluidnc:uploadGcode")?.(
        {},
        "task-2",
        "G1 X10",
        "/sd/job.gcode",
      ),
    ).rejects.toThrow("upload failed");

    expect(deps.taskManager.fail).toHaveBeenCalledWith(
      "task-2",
      "Error: upload failed",
    );
    expect(deps.safeSend).toHaveBeenCalledWith("task:update", { id: "task-2" });
  });

  it("tracks uploadFile and downloadFile task progress paths", async () => {
    const deps = buildDeps();
    deps.fluidnc.uploadFile.mockImplementation(
      async (
        _localPath: string,
        _remotePath: string,
        onProgress: (progress: number) => void,
      ) => {
        onProgress(25);
      },
    );
    deps.fluidnc.downloadFile.mockImplementation(
      async (
        _remotePath: string,
        _localPath: string,
        _filesystem: string | undefined,
        onProgress: (progress: number) => void,
      ) => {
        onProgress(75);
      },
    );

    await mocks.handlers.get("fluidnc:uploadFile")?.(
      {},
      "task-3",
      "local.gcode",
      "/sd/remote.gcode",
    );
    await mocks.handlers.get("fluidnc:downloadFile")?.(
      {},
      "task-4",
      "/sd/remote.gcode",
      "downloaded.gcode",
      "sdcard",
    );

    expect(deps.taskManager.update).toHaveBeenCalledWith("task-3", {
      progress: 25,
    });
    expect(deps.taskManager.update).toHaveBeenCalledWith("task-4", {
      progress: 75,
    });
    expect(deps.taskManager.complete).toHaveBeenCalledWith("task-3");
    expect(deps.taskManager.complete).toHaveBeenCalledWith("task-4");
  });

  it("rejects uploadFile and downloadFile when the transfer fails", async () => {
    const deps = buildDeps();
    deps.fluidnc.uploadFile.mockRejectedValue(new Error("upload failed"));
    deps.fluidnc.downloadFile.mockRejectedValue(new Error("download failed"));

    await expect(
      mocks.handlers.get("fluidnc:uploadFile")?.({}, "task-5", "local.gcode", "/remote.gcode"),
    ).rejects.toThrow("upload failed");
    await expect(
      mocks.handlers.get("fluidnc:downloadFile")?.({}, "task-6", "/remote.gcode", "out.gcode", "sdcard"),
    ).rejects.toThrow("download failed");

    expect(deps.taskManager.fail).toHaveBeenCalledWith("task-5", "Error: upload failed");
    expect(deps.taskManager.fail).toHaveBeenCalledWith("task-6", "Error: download failed");
    expect(deps.taskManager.complete).not.toHaveBeenCalled();
    expect(deps.taskManager.clearCancelHandler).toHaveBeenCalledWith("task-5");
    expect(deps.taskManager.clearCancelHandler).toHaveBeenCalledWith("task-6");
  });

  it("rejects a cancelled transfer without marking it failed or completed", async () => {
    const deps = buildDeps();
    // Cancelling aborts the transfer, which then throws.
    deps.taskManager.isCancelled.mockReturnValue(true);
    deps.fluidnc.uploadFile.mockRejectedValue(new Error("aborted"));

    await expect(
      mocks.handlers.get("fluidnc:uploadFile")?.({}, "task-7", "local.gcode", "/remote.gcode"),
    ).rejects.toThrow("Transfer cancelled");
    await expect(
      mocks.handlers.get("fluidnc:uploadGcode")?.({}, "task-8", "G1 X10", "/job.gcode"),
    ).rejects.toThrow("Transfer cancelled");

    expect(deps.taskManager.fail).not.toHaveBeenCalled();
    expect(deps.taskManager.complete).not.toHaveBeenCalled();
  });

  it("rejects a transfer cancelled too late to stop it", async () => {
    const deps = buildDeps();
    deps.taskManager.isCancelled.mockReturnValue(true);
    deps.fluidnc.uploadFile.mockResolvedValue(undefined);

    await expect(
      mocks.handlers.get("fluidnc:uploadFile")?.({}, "task-9", "local.gcode", "/remote.gcode"),
    ).rejects.toThrow("Transfer cancelled");

    expect(deps.taskManager.complete).not.toHaveBeenCalled();
  });
});
