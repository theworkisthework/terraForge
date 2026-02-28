import { describe, it, expect, beforeEach, vi } from "vitest";
import { useMachineStore } from "../../../src/renderer/src/store/machineStore";
import { createMachineConfig, createMachineStatus } from "../../helpers/factories";

beforeEach(() => {
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
  });
});

describe("machineStore", () => {
  // ── setConfigs ──────────────────────────────────────────────────────────

  it("sets configs and auto-selects first when none active", () => {
    const cfg = createMachineConfig({ id: "m1" });
    useMachineStore.getState().setConfigs([cfg]);
    expect(useMachineStore.getState().configs).toHaveLength(1);
    expect(useMachineStore.getState().activeConfigId).toBe("m1");
  });

  it("preserves activeConfigId when already set", () => {
    useMachineStore.setState({ activeConfigId: "existing" });
    useMachineStore.getState().setConfigs([createMachineConfig({ id: "m1" })]);
    expect(useMachineStore.getState().activeConfigId).toBe("existing");
  });

  // ── setActiveConfigId ───────────────────────────────────────────────────

  it("sets active config id", () => {
    useMachineStore.getState().setActiveConfigId("m2");
    expect(useMachineStore.getState().activeConfigId).toBe("m2");
  });

  // ── setStatus ───────────────────────────────────────────────────────────

  it("stores machine status", () => {
    const status = createMachineStatus();
    useMachineStore.getState().setStatus(status);
    expect(useMachineStore.getState().status?.state).toBe("Idle");
  });

  // ── setConnected ────────────────────────────────────────────────────────

  it("sets connected and clears wsLive on disconnect", () => {
    useMachineStore.setState({ connected: true, wsLive: true });
    useMachineStore.getState().setConnected(false);
    expect(useMachineStore.getState().connected).toBe(false);
    expect(useMachineStore.getState().wsLive).toBe(false);
  });

  // ── setWsLive ───────────────────────────────────────────────────────────

  it("sets WebSocket live state", () => {
    useMachineStore.getState().setWsLive(true);
    expect(useMachineStore.getState().wsLive).toBe(true);
  });

  // ── setSelectedJobFile ──────────────────────────────────────────────────

  it("sets and clears selected job file", () => {
    const file = { path: "/sd/test.gcode", source: "sd" as const, name: "test.gcode" };
    useMachineStore.getState().setSelectedJobFile(file);
    expect(useMachineStore.getState().selectedJobFile).toEqual(file);
    useMachineStore.getState().setSelectedJobFile(null);
    expect(useMachineStore.getState().selectedJobFile).toBeNull();
  });

  // ── activeConfig ────────────────────────────────────────────────────────

  it("returns the active config", () => {
    const cfg = createMachineConfig({ id: "m1", name: "My Plotter" });
    useMachineStore.getState().setConfigs([cfg]);
    useMachineStore.getState().setActiveConfigId("m1");
    expect(useMachineStore.getState().activeConfig()?.name).toBe("My Plotter");
  });

  it("returns undefined when no config matches", () => {
    expect(useMachineStore.getState().activeConfig()).toBeUndefined();
  });

  // ── CRUD helpers ────────────────────────────────────────────────────────

  it("addConfig pushes and persists via IPC", async () => {
    const cfg = createMachineConfig({ id: "new1" });
    await useMachineStore.getState().addConfig(cfg);
    expect(useMachineStore.getState().configs).toHaveLength(1);
    expect(window.terraForge.config.saveMachineConfig).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new1" }),
    );
  });

  it("updateConfig patches and persists", async () => {
    const cfg = createMachineConfig({ id: "u1", name: "Old" });
    useMachineStore.getState().setConfigs([cfg]);
    await useMachineStore.getState().updateConfig("u1", { name: "New" });
    expect(useMachineStore.getState().configs[0].name).toBe("New");
    expect(window.terraForge.config.saveMachineConfig).toHaveBeenCalled();
  });

  it("deleteConfig removes and fallback to first remaining", async () => {
    const c1 = createMachineConfig({ id: "d1" });
    const c2 = createMachineConfig({ id: "d2" });
    useMachineStore.setState({ configs: [c1, c2], activeConfigId: "d1" });
    await useMachineStore.getState().deleteConfig("d1");
    expect(useMachineStore.getState().configs).toHaveLength(1);
    expect(useMachineStore.getState().activeConfigId).toBe("d2");
    expect(window.terraForge.config.deleteMachineConfig).toHaveBeenCalledWith("d1");
  });
});
