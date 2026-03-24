import { describe, it, expect, beforeEach, vi } from "vitest";
import { useMachineStore } from "../../../src/renderer/src/store/machineStore";
import {
  createMachineConfig,
  createMachineStatus,
} from "../../helpers/factories";

beforeEach(() => {
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
    fwInfo: null,
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

  // ── setFwInfo ────────────────────────────────────────────────────────────

  it("setFwInfo stores the firmware version string", () => {
    useMachineStore.getState().setFwInfo("FluidNC v4.0.1");
    expect(useMachineStore.getState().fwInfo).toBe("FluidNC v4.0.1");
  });

  it("setFwInfo accepts null to clear the version", () => {
    useMachineStore.setState({ fwInfo: "FluidNC v4.0.1" });
    useMachineStore.getState().setFwInfo(null);
    expect(useMachineStore.getState().fwInfo).toBeNull();
  });

  // ── setConnected ────────────────────────────────────────────────────────

  it("sets connected and clears wsLive on disconnect", () => {
    useMachineStore.setState({ connected: true, wsLive: true });
    useMachineStore.getState().setConnected(false);
    expect(useMachineStore.getState().connected).toBe(false);
    expect(useMachineStore.getState().wsLive).toBe(false);
  });

  it("setConnected(false) clears fwInfo", () => {
    useMachineStore.setState({ connected: true, fwInfo: "FluidNC v4.0.1" });
    useMachineStore.getState().setConnected(false);
    expect(useMachineStore.getState().fwInfo).toBeNull();
  });

  // ── setWsLive ───────────────────────────────────────────────────────────

  it("sets WebSocket live state", () => {
    useMachineStore.getState().setWsLive(true);
    expect(useMachineStore.getState().wsLive).toBe(true);
  });

  // ── setSelectedJobFile ──────────────────────────────────────────────────

  it("sets and clears selected job file", () => {
    const file = {
      path: "/sd/test.gcode",
      source: "sd" as const,
      name: "test.gcode",
    };
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
    expect(window.terraForge.config.deleteMachineConfig).toHaveBeenCalledWith(
      "d1",
    );
  });

  // ── reorderConfigs ──────────────────────────────────────────────────────

  it("reorderConfigs reorders by given id array and persists", async () => {
    const c1 = createMachineConfig({ id: "r1", name: "First" });
    const c2 = createMachineConfig({ id: "r2", name: "Second" });
    const c3 = createMachineConfig({ id: "r3", name: "Third" });
    useMachineStore.setState({ configs: [c1, c2, c3] });
    await useMachineStore.getState().reorderConfigs(["r3", "r1", "r2"]);
    const names = useMachineStore.getState().configs.map((c) => c.name);
    expect(names).toEqual(["Third", "First", "Second"]);
    expect(window.terraForge.fs.saveConfigs).toHaveBeenCalled();
  });

  it("reorderConfigs preserves configs not in the ordered list", async () => {
    const c1 = createMachineConfig({ id: "r1" });
    const c2 = createMachineConfig({ id: "r2" });
    useMachineStore.setState({ configs: [c1, c2] });
    // Only reorder r1 → r2 is not in list, should be appended
    await useMachineStore.getState().reorderConfigs(["r1"]);
    expect(useMachineStore.getState().configs).toHaveLength(2);
    expect(useMachineStore.getState().configs[0].id).toBe("r1");
    expect(useMachineStore.getState().configs[1].id).toBe("r2");
  });

  // ── branch coverage gaps ────────────────────────────────────────────────

  it("updateConfig is a no-op for an unknown id (idx === -1 branch)", async () => {
    const cfg = createMachineConfig({ id: "u1", name: "Original" });
    useMachineStore.setState({ configs: [cfg] });
    await useMachineStore
      .getState()
      .updateConfig("nonexistent", { name: "Changed" });
    // config should be unchanged; saveMachineConfig should not have been called
    expect(useMachineStore.getState().configs[0].name).toBe("Original");
  });

  it("deleteConfig sets activeConfigId to null when deleting the only config", async () => {
    const cfg = createMachineConfig({ id: "only" });
    useMachineStore.setState({ configs: [cfg], activeConfigId: "only" });
    await useMachineStore.getState().deleteConfig("only");
    expect(useMachineStore.getState().configs).toHaveLength(0);
    expect(useMachineStore.getState().activeConfigId).toBeNull();
  });

  it("setActiveConfig sets activeConfigId directly", () => {
    useMachineStore.setState({ activeConfigId: null });
    useMachineStore.getState().setActiveConfig("cfg-42");
    expect(useMachineStore.getState().activeConfigId).toBe("cfg-42");
  });
});
