// ─── Machine Configuration ────────────────────────────────────────────────────

export type ConnectionType = "wifi" | "usb";
export type OriginType = "bottom-left" | "top-left";
export type PenType = "solenoid" | "servo" | "stepper";

export interface MachineConnection {
  type: ConnectionType;
  host?: string;
  port?: number;
  serialPath?: string;
}

export interface MachineConfig {
  id: string;
  name: string;
  bedWidth: number; // mm
  bedHeight: number; // mm
  origin: OriginType;
  penType: PenType;
  penUpCommand: string;
  penDownCommand: string;
  feedrate: number; // mm/min
  connection: MachineConnection;
}

// ─── Vector / Canvas Objects ─────────────────────────────────────────────────

export interface VectorObject {
  id: string;
  /** Original SVG source markup for this object */
  svgSource: string;
  /** Flattened absolute path data (d attribute) */
  path: string;
  /** Position on the bed in mm from the configured origin */
  x: number;
  y: number;
  /** Uniform scale factor (1 = 100%) */
  scale: number;
  /** Rotation in degrees */
  rotation: number;
  visible: boolean;
  /** Original bounding box in SVG user units */
  originalWidth: number;
  originalHeight: number;
  /** Layer / group name from source SVG */
  layer?: string;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  name: string;
  gcode: string;
  machineId: string;
  createdAt: number;
}

// ─── G-code Generation Options ───────────────────────────────────────────────

export interface GcodeOptions {
  arcFitting: boolean;
  arcTolerance: number; // mm tolerance for fitting arcs
}

// ─── Background Tasks ─────────────────────────────────────────────────────────

export type TaskType =
  | "svg-parse"
  | "gcode-generate"
  | "file-upload"
  | "file-download"
  | "file-delete"
  | "job-start"
  | "ws-connect";

export type TaskStatus = "running" | "completed" | "cancelled" | "error";

export interface BackgroundTask {
  id: string;
  type: TaskType;
  label: string;
  /** 0–100 or null when progress is indeterminate */
  progress: number | null;
  status: TaskStatus;
  error?: string;
}

// ─── FluidNC / Remote File System ─────────────────────────────────────────────

export interface RemoteFile {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
}

export interface MachineStatus {
  /** Raw status string from FluidNC, e.g. "<Idle|...>" */
  raw: string;
  state:
    | "Idle"
    | "Run"
    | "Hold"
    | "Jog"
    | "Alarm"
    | "Door"
    | "Check"
    | "Home"
    | "Sleep"
    | "Unknown";
  mpos: { x: number; y: number; z: number };
  wpos: { x: number; y: number; z: number };
  feedRate?: number;
  spindleSpeed?: number;
}

// ─── IPC / Preload API Contract ───────────────────────────────────────────────

export interface FluidNCApi {
  getStatus: () => Promise<MachineStatus>;
  sendCommand: (cmd: string) => Promise<string>;
  listFiles: (path?: string) => Promise<RemoteFile[]>;
  listSDFiles: (path?: string) => Promise<RemoteFile[]>;
  uploadFile: (
    taskId: string,
    localPath: string,
    remotePath: string,
  ) => Promise<void>;
  downloadFile: (
    taskId: string,
    remotePath: string,
    localPath: string,
  ) => Promise<void>;
  deleteFile: (remotePath: string) => Promise<void>;
  runFile: (remotePath: string, filesystem?: "sd" | "fs") => Promise<void>;
  pauseJob: () => Promise<void>;
  resumeJob: () => Promise<void>;
  abortJob: () => Promise<void>;
  connectWebSocket: (host: string, port: number) => Promise<void>;
  disconnectWebSocket: () => Promise<void>;
  onStatusUpdate: (cb: (status: MachineStatus) => void) => () => void;
  onConsoleMessage: (cb: (message: string) => void) => () => void;
}

export interface SerialApi {
  listPorts: () => Promise<string[]>;
  connect: (path: string, baudRate?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  send: (data: string) => Promise<void>;
  onData: (cb: (data: string) => void) => () => void;
}

export interface FsApi {
  openSvgDialog: () => Promise<string | null>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  saveGcodeDialog: (defaultName: string) => Promise<string | null>;
  loadConfigs: () => Promise<MachineConfig[]>;
  saveConfigs: (configs: MachineConfig[]) => Promise<void>;
}

export interface TasksApi {
  cancel: (taskId: string) => Promise<void>;
  onTaskUpdate: (cb: (task: BackgroundTask) => void) => () => void;
}

export interface JobsApi {
  generateGcode: (
    taskId: string,
    objects: VectorObject[],
    config: MachineConfig,
    options: GcodeOptions,
  ) => Promise<string>;
}

export interface ConfigApi {
  getMachineConfigs: () => Promise<MachineConfig[]>;
  saveMachineConfig: (config: MachineConfig) => Promise<void>;
  deleteMachineConfig: (id: string) => Promise<void>;
}

export interface TerraForgeAPI {
  fluidnc: FluidNCApi;
  serial: SerialApi;
  fs: FsApi;
  tasks: TasksApi;
  jobs: JobsApi;
  config: ConfigApi;
}

// ─── Jog ─────────────────────────────────────────────────────────────────────

export type JogAxis = "X" | "Y" | "Z";
export type JogStep = 0.1 | 1 | 10 | 100;
export type JogDirection = 1 | -1;

// Augment Window so the renderer can reference the typed API
declare global {
  interface Window {
    terraForge: TerraForgeAPI;
  }
}
