import { describe, it, expect } from "vitest";
import { parseFluidNCStatus } from "../../src/machine/serial";

describe("parseFluidNCStatus", () => {
  // ── State parsing ───────────────────────────────────────────────────────

  it("parses Idle state", () => {
    const s = parseFluidNCStatus("<Idle|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Idle");
  });

  it("parses Run state", () => {
    const s = parseFluidNCStatus("<Run|MPos:10.000,20.000,0.000>");
    expect(s.state).toBe("Run");
  });

  it("parses Hold state", () => {
    const s = parseFluidNCStatus("<Hold:0|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Hold");
  });

  it("parses Alarm state", () => {
    const s = parseFluidNCStatus("<Alarm|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Alarm");
  });

  it("parses Jog state", () => {
    const s = parseFluidNCStatus("<Jog|MPos:5.000,5.000,0.000>");
    expect(s.state).toBe("Jog");
  });

  it("returns Unknown for invalid state", () => {
    const s = parseFluidNCStatus("<Banana|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Unknown");
  });

  it("returns Unknown for empty/garbage input", () => {
    const s = parseFluidNCStatus("garbage data");
    expect(s.state).toBe("Unknown");
  });

  // ── Position parsing ────────────────────────────────────────────────────

  it("extracts MPos coordinates", () => {
    const s = parseFluidNCStatus("<Idle|MPos:12.345,67.890,1.000>");
    expect(s.mpos).toEqual({ x: 12.345, y: 67.89, z: 1 });
  });

  it("extracts WPos when present", () => {
    const s = parseFluidNCStatus("<Idle|MPos:0,0,0|WPos:5.5,6.6,7.7>");
    expect(s.wpos).toEqual({ x: 5.5, y: 6.6, z: 7.7 });
  });

  it("falls back to MPos for WPos when WPos absent", () => {
    const s = parseFluidNCStatus("<Idle|MPos:10,20,30>");
    expect(s.wpos).toEqual({ x: 10, y: 20, z: 30 });
  });

  it("defaults positions to 0,0,0 when not present", () => {
    const s = parseFluidNCStatus("<Idle>");
    expect(s.mpos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("handles negative coordinates", () => {
    const s = parseFluidNCStatus("<Idle|MPos:-10.5,-20.3,-0.1>");
    expect(s.mpos.x).toBeCloseTo(-10.5);
    expect(s.mpos.y).toBeCloseTo(-20.3);
    expect(s.mpos.z).toBeCloseTo(-0.1);
  });

  // ── Line number parsing ─────────────────────────────────────────────────

  it("extracts line number and total from Ln: field", () => {
    const s = parseFluidNCStatus("<Run|MPos:0,0,0|Ln:42,100>");
    expect(s.lineNum).toBe(42);
    expect(s.lineTotal).toBe(100);
  });

  it("returns undefined for lineNum when Ln not present", () => {
    const s = parseFluidNCStatus("<Idle|MPos:0,0,0>");
    expect(s.lineNum).toBeUndefined();
    expect(s.lineTotal).toBeUndefined();
  });

  // ── Raw string ──────────────────────────────────────────────────────────

  it("preserves the raw input string", () => {
    const raw = "<Idle|MPos:1,2,3>";
    const s = parseFluidNCStatus(raw);
    expect(s.raw).toBe(raw);
  });

  // ── All valid states ────────────────────────────────────────────────────

  it.each([
    "Idle",
    "Run",
    "Hold",
    "Jog",
    "Alarm",
    "Door",
    "Check",
    "Home",
    "Sleep",
  ])("recognises %s as a valid state", (state) => {
    const s = parseFluidNCStatus(`<${state}|MPos:0,0,0>`);
    expect(s.state).toBe(state);
  });
});
