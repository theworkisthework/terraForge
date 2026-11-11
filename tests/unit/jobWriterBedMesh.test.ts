import { describe, expect, it } from "vitest";
import type { BedMesh } from "../../src/types";
import { resolveGenerationSettings } from "../../src/workers/generation/document";
import { JobWriter } from "../../src/workers/generation/jobWriter";
import { createGcodeOptions, createMachineConfig } from "../helpers/factories";

const flatMesh: BedMesh = {
  version: 1,
  name: "flat",
  xPoints: 2,
  yPoints: 2,
  widthMM: 20,
  heightMM: 10,
  points: [
    { x: 0, y: 0, z: 0.25 },
    { x: 20, y: 0, z: 0.25 },
    { x: 0, y: 10, z: 0.25 },
    { x: 20, y: 10, z: 0.25 },
  ],
  createdAt: "",
};

function makeWriter(mesh: BedMesh) {
  const lines: string[] = [];
  const config = createMachineConfig({
    penUpCommand: "G0Z15",
    penDownCommand: "G0Z0",
  });
  const settings = resolveGenerationSettings(config, createGcodeOptions({ bedMesh: mesh }));
  return { lines, writer: new JobWriter(lines, config, settings) };
}

describe("JobWriter bed mesh compensation", () => {
  it("adds offsets to nominal pen-up and contact heights for travel and point taps", () => {
    const { lines, writer } = makeWriter(flatMesh);
    writer.writePointTap({ point: { x: 5, y: 5 }, repeats: 1 });

    expect(lines).toContain("G0 X5.000 Y5.000 Z15.250 ; Point rapid");
    expect(lines).toContain("G0Z0.250 ; Point tap");
    expect(lines).toContain("G0Z15.250 ; Pen up");
  });

  it("uses relative mesh adjustments with machine-coordinate pen commands", () => {
    const lines: string[] = [];
    const config = createMachineConfig({
      penUpCommand: "G53 G0Z1",
      penDownCommand: "G53 G0Z0",
    });
    const settings = resolveGenerationSettings(config, createGcodeOptions({ bedMesh: flatMesh }));
    const writer = new JobWriter(lines, config, settings);
    writer.writeSubpath({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] });

    expect(lines).toContain("G91 G21 G0 Z0.250 ; Bed mesh offset");
    expect(lines).toContain("G53 G0Z0.250 ; Pen down");
    expect(lines).not.toContain("G0 Z1.250");
    expect(lines).not.toContain("G0 Z0.250");
  });

  it("ignores Z values in pen-command comments", () => {
    const lines: string[] = [];
    const config = createMachineConfig({
      penUpCommand: "G0Z15 ; safe Z0",
      penDownCommand: "G0Z0 ; lower to Z-50",
    });
    const settings = resolveGenerationSettings(config, createGcodeOptions({ bedMesh: flatMesh }));
    const writer = new JobWriter(lines, config, settings);
    writer.writePointTap({ point: { x: 5, y: 5 }, repeats: 1 });

    expect(lines).toContain("G0Z0.250 ; lower to Z-50 ; Point tap");
    expect(lines).toContain("G0Z15.250 ; safe Z0 ; Pen up");
  });

  it("splits drawing moves at mesh-cell boundaries and follows the interpolated rise", () => {
    const ridge: BedMesh = {
      ...flatMesh,
      xPoints: 3,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 1 },
        { x: 20, y: 0, z: 0 },
        { x: 0, y: 10, z: 0 },
        { x: 10, y: 10, z: 1 },
        { x: 20, y: 10, z: 0 },
      ],
    };
    const { lines, writer } = makeWriter(ridge);
    writer.writeSubpath({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] });

    expect(lines).toContain("G0 X0.000 Y0.000 Z15.000 ; Rapid travel");
    expect(lines).toContain("G0Z0.000 ; Pen down");
    expect(lines).toContain("G1 X10.000 Y0.000 Z1.000");
    expect(lines).toContain("G1 X20.000 Y0.000 Z0.000");
    expect(lines).toContain("G0Z15.000 ; Pen up");
  });

  it("splits at the mesh bounds when a line crosses a smaller imported mesh", () => {
    const narrowMesh: BedMesh = {
      ...flatMesh,
      widthMM: 10,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 1 },
        { x: 0, y: 10, z: 0 },
        { x: 10, y: 10, z: 1 },
      ],
    };
    const { lines, writer } = makeWriter(narrowMesh);
    writer.writeSubpath({ points: [{ x: -5, y: 0 }, { x: 15, y: 0 }] });

    expect(lines).toContain("G1 X0.000 Y0.000 Z0.000");
    expect(lines).toContain("G1 X10.000 Y0.000 Z1.000");
  });

  it("keeps mesh subdivision when ink-service triggers split the drawing line", () => {
    const ridge: BedMesh = {
      ...flatMesh,
      xPoints: 3,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 1 },
        { x: 20, y: 0, z: 0 },
        { x: 0, y: 10, z: 0 },
        { x: 10, y: 10, z: 1 },
        { x: 20, y: 10, z: 0 },
      ],
    };
    const lines: string[] = [];
    const config = createMachineConfig({
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
    });
    const settings = resolveGenerationSettings(config, createGcodeOptions({
      bedMesh: ridge,
      inkService: {
        mode: "prime-wipe",
        triggerTravelMM: 5,
        stations: [{ id: "prime", name: "Prime", type: "prime", x: 2, y: 2, dwellMs: 0 }],
      },
    }));
    const writer = new JobWriter(lines, config, settings);
    writer.writeSubpath({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] });

    expect(lines).toContain("G1 X10.000 Y0.000 Z1.000");
  });

  it("omits compensation for invalid meshes", () => {
    const invalid = { ...flatMesh, points: flatMesh.points.slice(1) };
    const { lines, writer } = makeWriter(invalid);
    writer.writeSubpath({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] });

    expect(lines).toContain("G0 X0.000 Y0.000 ; Rapid travel");
    expect(lines).toContain("G1 X20.000 Y0.000");
    expect(lines.some((line) => /\bZ/.test(line))).toBe(false);
  });
});
