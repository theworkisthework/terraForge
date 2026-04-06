import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import { registerPushEventForwarders } from "../../../src/main/events/pushEvents";

describe("registerPushEventForwarders", () => {
  it("forwards task and fluidnc events to renderer channels", () => {
    const taskManager = new EventEmitter();
    const fluidnc = new EventEmitter();
    const serial = new EventEmitter();
    const safeSend = vi.fn();

    registerPushEventForwarders({
      taskManager: taskManager as any,
      fluidnc: fluidnc as any,
      serial: serial as any,
      safeSend,
    });

    taskManager.emit("task-update", { id: "task-1" });
    fluidnc.emit("status", { state: "idle" });
    fluidnc.emit("console", "ok");
    fluidnc.emit("ping");
    fluidnc.emit("firmware", "v1.0.0");

    expect(safeSend).toHaveBeenCalledWith("task:update", { id: "task-1" });
    expect(safeSend).toHaveBeenCalledWith("fluidnc:status", { state: "idle" });
    expect(safeSend).toHaveBeenCalledWith("fluidnc:console", "ok");
    expect(safeSend).toHaveBeenCalledWith("fluidnc:ping");
    expect(safeSend).toHaveBeenCalledWith("fluidnc:firmware", "v1.0.0");
  });

  it("maps serial status to fluidnc channels and forwards serial data", () => {
    const taskManager = new EventEmitter();
    const fluidnc = new EventEmitter();
    const serial = new EventEmitter();
    const safeSend = vi.fn();

    registerPushEventForwarders({
      taskManager: taskManager as any,
      fluidnc: fluidnc as any,
      serial: serial as any,
      safeSend,
    });

    serial.emit("status", { state: "run" });
    serial.emit("data", "MPos:0,0,0");

    expect(safeSend).toHaveBeenCalledWith("fluidnc:status", { state: "run" });
    expect(safeSend).toHaveBeenCalledWith("fluidnc:ping");
    expect(safeSend).toHaveBeenCalledWith("serial:data", "MPos:0,0,0");
  });
});
