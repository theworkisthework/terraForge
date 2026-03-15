/**
 * Test data factories for terraForge domain types.
 * Each factory creates a valid default object that can be overridden.
 */
import type {
  MachineConfig,
  VectorObject,
  SvgImport,
  SvgPath,
  BackgroundTask,
  MachineStatus,
  GcodeOptions,
} from "../../src/types";
import type { GcodeToolpath } from "../../src/renderer/src/utils/gcodeParser";

let _idCounter = 0;
function testId(): string {
  return `test-id-${++_idCounter}`;
}

export function resetIdCounter(): void {
  _idCounter = 0;
}

export function createMachineConfig(
  overrides?: Partial<MachineConfig>,
): MachineConfig {
  return {
    id: testId(),
    name: "Test Machine",
    bedWidth: 220,
    bedHeight: 200,
    origin: "bottom-left",
    penType: "solenoid",
    penUpCommand: "M5",
    penDownCommand: "M3 S1000",
    feedrate: 3000,
    connection: { type: "wifi", host: "test.local", port: 80 },
    ...overrides,
  };
}

export function createVectorObject(
  overrides?: Partial<VectorObject>,
): VectorObject {
  return {
    id: testId(),
    svgSource: "<path/>",
    path: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    originalWidth: 10,
    originalHeight: 10,
    ...overrides,
  };
}

export function createSvgPath(overrides?: Partial<SvgPath>): SvgPath {
  return {
    id: testId(),
    d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
    svgSource: "<path/>",
    visible: true,
    ...overrides,
  };
}

export function createSvgImport(overrides?: Partial<SvgImport>): SvgImport {
  return {
    id: testId(),
    name: "test-import",
    paths: [createSvgPath()],
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 100,
    svgHeight: 100,
    viewBoxX: 0,
    viewBoxY: 0,
    ...overrides,
  };
}

export function createBackgroundTask(
  overrides?: Partial<BackgroundTask>,
): BackgroundTask {
  return {
    id: testId(),
    type: "gcode-generate",
    label: "Test task",
    progress: null,
    status: "running",
    ...overrides,
  };
}

export function createMachineStatus(
  overrides?: Partial<MachineStatus>,
): MachineStatus {
  return {
    raw: "<Idle|MPos:0.000,0.000,0.000|FS:0,0>",
    state: "Idle",
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

export function createGcodeOptions(
  overrides?: Partial<GcodeOptions>,
): GcodeOptions {
  return {
    arcFitting: false,
    arcTolerance: 0.1,
    optimisePaths: false,
    joinPaths: false,
    joinTolerance: 0.2,
    liftPenAtEnd: true,
    returnToHome: false,
    customStartGcode: "",
    customEndGcode: "",
    ...overrides,
  };
}

export function createGcodeToolpath(
  overrides?: Partial<GcodeToolpath>,
): GcodeToolpath {
  return {
    cuts: "M 0.000 0.000 L 100.000 100.000",
    rapids: "M 0.000 0.000 L 50.000 50.000",
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    lineCount: 10,
    fileSizeBytes: 128,
    totalCutDistance: 141.421,
    totalRapidDistance: 70.711,
    feedrate: 3000,
    ...overrides,
  };
}
