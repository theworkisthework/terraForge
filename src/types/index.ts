// ─── Machine Configuration ────────────────────────────────────────────────────

export type ConnectionType = "wifi" | "usb";
export type OriginType =
  | "bottom-left"
  | "top-left"
  | "bottom-right"
  | "top-right"
  | "center";
export type PenType = "solenoid" | "servo" | "stepper";

export interface MachineConnection {
  type: ConnectionType;
  host?: string;
  port?: number;
  /**
   * WebSocket port override.
   * - Leave unset for FluidNC 4.x: WebSocket shares the HTTP port (default 80).
   * - Set to 81 for older ESP3D-based FluidNC firmware (separate WS port).
   */
  wsPort?: number;
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
  /**
   * Non-uniform scale overrides.  When set (ratio lock off) these take
   * precedence over `scale` for the relevant axis.  Absent = uniform scale.
   */
  scaleX?: number;
  scaleY?: number;
  /** Rotation in degrees */
  rotation: number;
  visible: boolean;
  /** Original bounding box in SVG user units */
  originalWidth: number;
  originalHeight: number;
  /** Layer / group name from source SVG */
  layer?: string;
}

// ─── SVG Import Model ─────────────────────────────────────────────────────────

/** A single path element extracted from an imported SVG file */
export interface SvgPath {
  id: string;
  /** Path d-string in the SVG's user-unit coordinate space */
  d: string;
  /** Original element outerHTML (preserved for G-code worker) */
  svgSource: string;
  visible: boolean;
  /** Layer/group name derived from closest ancestor with an id */
  layer?: string;
}

/** One imported SVG file, treated as a positioned group on the bed */
export interface SvgImport {
  id: string;
  /** Display name — defaults to filename without extension */
  name: string;
  paths: SvgPath[];
  /** Position of the SVG's bottom-left corner on the bed (mm) */
  x: number;
  y: number;
  /** Uniform scale factor (SVG user units → mm).  Used for both axes when
   *  scaleX / scaleY are absent (ratio locked). */
  scale: number;
  /**
   * Per-axis scale overrides — only set when ratio lock is OFF.
   * When present these replace `scale` for the respective axis so that
   * W and H can be set independently.  Drag-to-resize handles always
   * restore uniform scale.
   */
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  visible: boolean;
  /** SVG viewBox dimensions in user units */
  svgWidth: number;
  svgHeight: number;
  /** ViewBox origin (for SVGs with non-zero viewBox x/y offset) */
  viewBoxX: number;
  viewBoxY: number;
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
  optimisePaths: boolean; // nearest-neighbour reorder to minimise rapid travel
  joinPaths: boolean; // [experimental] connect endpoints within joinTolerance to skip pen up/down
  joinTolerance: number; // mm — max gap between path end and next path start to join (default 0.2)
  liftPenAtEnd: boolean; // send penUpCommand after the last stroke (default true)
  returnToHome: boolean; // send G0 X0 Y0 at end of job (default false)
  customStartGcode: string; // raw G-code lines inserted after the preamble, before paths
  customEndGcode: string; // raw G-code lines appended after lift/return, before EOF comment
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
  /** Current G-code line number being executed (from Ln:) */
  lineNum?: number;
  /** Total G-code lines in the file (from Ln:) */
  lineTotal?: number;
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
    filesystem?: "internal" | "sdcard",
  ) => Promise<void>;
  fetchFileText: (
    remotePath: string,
    filesystem?: "internal" | "sdcard",
  ) => Promise<string>;
  deleteFile: (remotePath: string, source?: "sd" | "fs") => Promise<void>;
  runFile: (remotePath: string, filesystem?: "sd" | "fs") => Promise<void>;
  /**
   * Upload a G-code string directly to the machine SD card.
   * Main process writes a temp file, streams it via the existing upload
   * endpoint, then deletes the temp file.
   */
  uploadGcode: (
    taskId: string,
    content: string,
    remotePath: string,
  ) => Promise<void>;
  pauseJob: () => Promise<void>;
  resumeJob: () => Promise<void>;
  abortJob: () => Promise<void>;
  connectWebSocket: (
    host: string,
    port: number,
    wsPort?: number,
  ) => Promise<void>;
  disconnectWebSocket: () => Promise<void>;
  onStatusUpdate: (cb: (status: MachineStatus) => void) => () => void;
  onConsoleMessage: (cb: (message: string) => void) => () => void;
  onPing: (cb: () => void) => () => void;
  onFirmwareInfo: (cb: (info: string | null) => void) => () => void;
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
  openPdfDialog: () => Promise<string | null>;
  openFileDialog: () => Promise<string | null>;
  openGcodeDialog: () => Promise<string | null>;
  openImportDialog: () => Promise<string | null>;
  readFile: (filePath: string) => Promise<string>;
  /** Read a file as raw bytes — required for binary formats such as PDF. */
  readFileBinary: (filePath: string) => Promise<Uint8Array>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  saveGcodeDialog: (defaultName: string) => Promise<string | null>;
  saveFileDialog: (defaultName: string) => Promise<string | null>;
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
  /** Export all configs to a user-chosen .json file. Returns the path written, or null if cancelled. */
  exportConfigs: () => Promise<string | null>;
  /** Import configs from a .json file chosen by the user. Returns counts of added and skipped configs. */
  importConfigs: () => Promise<{ added: number; skipped: number }>;
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
