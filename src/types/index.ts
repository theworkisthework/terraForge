// ─── Machine Configuration ────────────────────────────────────────────────────

export type ConnectionType = "wifi" | "usb";
export type OriginType =
  | "bottom-left"
  | "top-left"
  | "bottom-right"
  | "top-right"
  | "center";
export type PenType =
  | "solenoid-hardware"
  | "solenoid-software"
  | "servo"
  | "stepper";
export type PassMode = "repeat" | "backtrack" | "penLift";

export function isSolenoidPenType(
  penType: PenType,
): penType is "solenoid-hardware" | "solenoid-software" {
  return penType === "solenoid-hardware" || penType === "solenoid-software";
}

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
  /** Invert relative Z jog direction for jog panel pen up/down buttons. */
  invertZJogControls?: boolean;
  /** Delay after pen-down before XY motion begins (milliseconds). */
  penDownDelayMs: number;
  /** Delay after pen-up before rapid travel begins (milliseconds). */
  penUpDelayMs: number;
  /** Speed for jog panel commands ($J moves). mm/min. */
  jogSpeed: number;
  /** Default drawing feedrate emitted in generated G-code (F word). mm/min. */
  drawSpeed: number;
  connection: MachineConnection;
}

export interface AppConfig {
  /** Enables verbose debug command transport logs in the console panel. */
  debugLoggingEnabled: boolean;
}

export interface VinylCuttingSettings {
  enabled: boolean;
  bladeOffsetMM: number;
  cornerAngleThresholdDeg: number;
  microJogMagnitudeMM: number;
}

export interface VinylWeedBorderSettings {
  enabled: boolean;
  marginMM: number;
}

export type InkServiceMode = "prime-wipe" | "brush-dip";
export type InkServiceStationType = "prime" | "wipe" | "dip" | "wash";
export type InkServicePattern = "back-forth" | "circular";

export interface InkServicePrimeAction {
  kind: "prime-press";
  /** Relative plunge depth per press (mm). */
  zDepthMM: number;
  /** Number of press cycles to run at the station. */
  pressCount: number;
}

export interface InkServiceBrushMotionAction {
  kind: "brush-motion";
  /** Relative plunge depth for the dip motion (mm). */
  zDepthMM: number;
  pattern: InkServicePattern;
  repetitions: number;
  /** Pattern amplitude in mm (radius for circular, half-stroke for back-forth). */
  distanceMM: number;
}

export type InkServiceStationAction =
  | InkServicePrimeAction
  | InkServiceBrushMotionAction;

export interface InkServiceStation {
  id: string;
  name: string;
  type: InkServiceStationType;
  x: number;
  y: number;
  /** Contact dwell time in milliseconds after pen-down at this station. */
  dwellMs: number;
  /** Optional station color label (used for brush dip trays). */
  color?: string;
  /** Optional motion recipe performed at this station. */
  action?: InkServiceStationAction;
  enabled?: boolean;
}

export interface InkServiceSettings {
  mode: InkServiceMode;
  /** Trigger service moves when rapid-travel distance crosses this threshold (mm). */
  triggerTravelMM: number;
  /** Optional trigger jitter as +/- percent, e.g. 10 = +/-10%. */
  triggerJitterPct?: number;
  stations: InkServiceStation[];
  /** For brush mode: randomise dip station selection instead of cycling. */
  randomizeDipStation?: boolean;
  /** For brush mode: include wash station periodically when available. */
  includeWashMove?: boolean;
  /** For brush mode: perform wash after every N dips (minimum 1). */
  washEveryNDips?: number;
  /** Optional mapping from SVG layer id/name to a dip station id. */
  layerDipStations?: Record<string, string>;
}

export const DEFAULT_INK_SERVICE_STATIONS: InkServiceStation[] = [
  {
    id: "prime",
    name: "Prime",
    type: "prime",
    x: 10,
    y: 10,
    dwellMs: 600,
    action: {
      kind: "prime-press",
      zDepthMM: 1,
      pressCount: 3,
    },
    enabled: true,
  },
  {
    id: "wipe",
    name: "Wipe",
    type: "wipe",
    x: 24,
    y: 10,
    dwellMs: 350,
    enabled: true,
  },
  {
    id: "dip-black",
    name: "Dip Black",
    type: "dip",
    x: 38,
    y: 10,
    dwellMs: 500,
    color: "black",
    action: {
      kind: "brush-motion",
      zDepthMM: 2,
      pattern: "back-forth",
      repetitions: 3,
      distanceMM: 2,
    },
    enabled: false,
  },
  {
    id: "wash",
    name: "Wash",
    type: "wash",
    x: 52,
    y: 10,
    dwellMs: 900,
    action: {
      kind: "brush-motion",
      zDepthMM: 2,
      pattern: "circular",
      repetitions: 2,
      distanceMM: 2,
    },
    enabled: true,
  },
];

// ─── Pass Configuration ──────────────────────────────────────────────────────

/**
 * Configuration for multiple passes per path.
 * - `repeat`: Draw path start→end, repeat n times from the same start point
 * - `backtrack`: Draw forward, then backward (trace back) without lifting pen, repeat as one cycle
 * - `penLift`: Like repeat, but lift pen between each pass (to prime pens, etc.)
 */
export interface PassConfig {
  /** Number of times to repeat the path (1 = single pass, default) */
  passCount: number;
  /** How to handle the passes: repeat, backtrack, or penLift */
  passMode: PassMode;
}

// ─── Vector / Canvas Objects ─────────────────────────────────────────────────

export interface VectorObject {
  id: string;
  /** Original SVG source markup for this object */
  svgSource: string;
  /** Flattened absolute path data (d attribute) */
  path: string;
  /** Optional point-tap source coordinate in SVG user units. */
  pointTap?: { x: number; y: number };
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
  /** SVG viewBox origin offsets for paths not normalised to (0,0). */
  viewBoxX?: number;
  viewBoxY?: number;
  /** Layer / group name from source SVG */
  layer?: string;
  /** Source fill color for color-based G-code batching (e.g. '#FF0000', 'black'). */
  sourceColor?: string;
  /** Number of times to repeat this path (default 1). */
  passCount?: number;
  /** How to handle multiple passes: repeat, backtrack, or penLift (default 'repeat'). */
  passMode?: PassMode;
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
  /** Human-readable display name for this path */
  label?: string;
  /** Id of the `SvgLayer` (within the parent `SvgImport.layers`) that this path
   *  belongs to, or undefined for paths not inside a detected layer group. */
  layer?: string;
  /** Whether the original shape had a visible fill colour (used to regenerate hatch) */
  hasFill?: boolean;
  /** Resolved fill color from SVG (e.g. '#FF0000', 'black', 'rgb(255,0,0)').
   *  Set only if hasFill is true; used for color-based path grouping. */
  fillColor?: string;
  /** Resolved visible source stroke color from SVG, normalized when available. */
  strokeColor?: string;
  /** Effective visual source color for grouping (prefers fill, falls back to stroke). */
  sourceColor?: string;
  /** True when the source SVG had an explicit visible stroke after style resolution. */
  sourceOutlineVisible?: boolean;
  /** Whether the outline should be plotted. False for shapes with no visible stroke.
   *  The path geometry is still retained for hatch-fill computation. */
  outlineVisible?: boolean;
  /** User toggle for this path's outline visibility. Defaults to true. */
  strokeEnabled?: boolean;
  /** User toggle for this path's fill visibility (controls hatch rendering).
   *  When false the fill/hatch is hidden but the stroke remains visible.
   *  Controlled by fill-color group toggles in the Properties Panel. */
  fillEnabled?: boolean;
  /** Per-path override to generate an outline even when source stroke is absent. */
  generatedStrokeEnabled?: boolean;
  /** Hatch-fill line d-strings synthesised from this path's fill at import time.
   *  Rendered and emitted for G-code alongside the outline.  Toggled as a unit
   *  with the parent path's `visible` flag. */
  hatchLines?: string[];
  /** Optional point-tap coordinate in SVG user units (after source transforms). */
  pointTap?: { x: number; y: number };
  /** Number of times to repeat this path (default 1). */
  passCount?: number;
  /** How to handle multiple passes: repeat, backtrack, or penLift (default 'repeat'). */
  passMode?: PassMode;
}

/** A logical sub-layer within an imported SVG (e.g. an Inkscape layer group). */
export interface SvgLayer {
  /** Matches the HTML `id` of the source `<g>` element */
  id: string;
  /** Human-readable label (from `inkscape:label`, element id, or class) */
  name: string;
  /** Whether paths in this layer are currently visible on the canvas */
  visible: boolean;
}

/** Default hatch spacing in mm — used on import and as the UI default. */
export const DEFAULT_HATCH_SPACING_MM = 2;
/** Default hatch angle in degrees — used on import and as the UI default. */
export const DEFAULT_HATCH_ANGLE_DEG = 45;
/** Default stroke width in mm — used on import and as the UI default. */
export const DEFAULT_STROKE_WIDTH_MM = 0.5;

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
  /** Per-import hatch fill settings (override the global GcodePrefs defaults).
   *  Optional at creation — `addImport` fills in defaults if absent. */
  hatchEnabled?: boolean;
  hatchSpacingMM?: number;
  hatchAngleDeg?: number;
  /** Import-level default toggle for stroke outlines. Defaults to true. */
  strokeEnabled?: boolean;
  /** Import-level toggle to emit point taps for paths carrying `pointTap` metadata. */
  plotPointsEnabled?: boolean;
  /** Import-level toggle to generate outlines for source paths with no stroke. */
  generatedStrokeForNoStroke?: boolean;
  /** Preview stroke width in mm — controls how thick paths appear on the canvas.
   *  Does not affect G-code output. Defaults to DEFAULT_STROKE_WIDTH_MM. */
  strokeWidthMM?: number;
  /** Logical layers detected from the source SVG (e.g. Inkscape sub-layers).
   *  Each `SvgPath.layer` is the `id` of its containing `SvgLayer`.
   *  Absent for SVGs with no detectable layer groups. */
  layers?: SvgLayer[];
}

// ─── Page Templates ──────────────────────────────────────────────────────────

/** A named paper/page size definition. Dimensions are in portrait orientation. */
export interface PageSize {
  id: string;
  name: string;
  /** Width in portrait orientation (mm) */
  widthMM: number;
  /** Height in portrait orientation (mm) */
  heightMM: number;
}

/** The active page template overlay shown on the canvas. */
export interface PageTemplate {
  /** Matches PageSize.id */
  sizeId: string;
  landscape: boolean;
  /** Margin in mm drawn as a second inset overlay inside the page boundary. */
  marginMM: number;
}

/** Built-in page sizes used as defaults when no custom page-sizes.json exists. */
export const BUILT_IN_PAGE_SIZES: PageSize[] = [
  { id: "a2", name: "A2", widthMM: 420, heightMM: 594 },
  { id: "a3", name: "A3", widthMM: 297, heightMM: 420 },
  { id: "a4", name: "A4", widthMM: 210, heightMM: 297 },
  { id: "a5", name: "A5", widthMM: 148, heightMM: 210 },
  { id: "a6", name: "A6", widthMM: 105, heightMM: 148 },
  { id: "letter", name: "Letter", widthMM: 215.9, heightMM: 279.4 },
  { id: "legal", name: "Legal", widthMM: 215.9, heightMM: 355.6 },
  { id: "tabloid", name: "Tabloid", widthMM: 279.4, heightMM: 431.8 },
];

// ─── Canvas Layout ──────────────────────────────────────────────────────────────

/** Serialised canvas layout — saved/loaded as .tforge JSON. */
export interface CanvasLayout {
  /** Format version — increment if the schema changes in a breaking way. */
  tfVersion: number;
  savedAt: string;
  imports: SvgImport[];
  /** Layer groups — optional for backward compatibility with older layout files. */
  layerGroups?: LayerGroup[];
  /** Active page template — optional for backward compatibility. */
  pageTemplate?: PageTemplate | null;
}

// ─── Layer Groups ────────────────────────────────────────────────────────────

/**
 * A named, coloured collection of SvgImport objects for multi-pen plotting.
 * Each group can be exported as a separate G-code file via "Export per group".
 */
export interface LayerGroup {
  id: string;
  /** User-visible name — used as the G-code filename base */
  name: string;
  /** Display colour in CSS hex notation, e.g. "#e94560" */
  color: string;
  /** SvgImport.id values belonging to this group */
  importIds: string[];
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
  /** Path direction strategy during optimisation.
   *  "minimize-travel" may reverse individual subpaths to reduce rapids.
   *  "respect" preserves each subpath's original point order. */
  pathDirectionMode?: "respect" | "minimize-travel";
  joinPaths: boolean; // [experimental] connect endpoints within joinTolerance to skip pen up/down
  joinTolerance: number; // mm — max gap between path end and next path start to join (default 0.2)
  liftPenAtEnd: boolean; // send penUpCommand after the last stroke (default true)
  returnToHome: boolean; // send G0 X0 Y0 at end of job (default false)
  /** Optional per-generation override for pen-down delay (milliseconds). */
  penDownDelayMsOverride?: number;
  /** Optional per-generation override for pen-up delay (milliseconds). */
  penUpDelayMsOverride?: number;
  customStartGcode: string; // raw G-code lines inserted after the preamble, before paths
  customEndGcode: string; // raw G-code lines appended after lift/return, before EOF comment
  /** When a page template is active, clip G-code to the page's printable area
   *  (page dimensions minus margin on all sides) instead of the full machine bed. */
  pageClip?: { widthMM: number; heightMM: number; marginMM: number };
  /** Optional per-job drawing speed override (mm/min). Overrides machine drawSpeed when set. */
  drawSpeedOverride?: number;
  /** Optional drag-knife / vinyl cutter compensation settings for this job. */
  vinylCutting?: Omit<VinylCuttingSettings, "enabled">;
  /** Optional weed-border rectangle around the final job bounds. */
  vinylWeedBorder?: Omit<VinylWeedBorderSettings, "enabled">;
  /** Optional travel-triggered pen/brush service moves (prime/wipe or dip/wash). */
  inkService?: InkServiceSettings;
}

// ─── Background Tasks ─────────────────────────────────────────────────────────

export type TaskType =
  | "svg-parse"
  | "gcode-generate"
  | "gcode-preview"
  | "file-upload"
  | "file-download"
  | "file-delete"
  | "job-start"
  | "ws-connect";

export type TaskStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "warning"
  | "error";

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
  saveLayoutDialog: (defaultName: string) => Promise<string | null>;
  openLayoutDialog: () => Promise<string | null>;
  /** Open a native folder picker. Returns the chosen directory path, or null if cancelled. */
  chooseDirectory: () => Promise<string | null>;
  /** Subscribe to native File-menu → layout action events. Returns an unsubscribe fn. */
  onMenuImport: (cb: () => void) => () => void;
  onMenuOpenLayout: (cb: () => void) => () => void;
  onMenuSaveLayout: (cb: () => void) => () => void;
  onMenuCloseLayout: (cb: () => void) => () => void;
  /** Notify the main process whether the Save/Close Layout menu items should be enabled. */
  setLayoutMenuState: (hasImports: boolean) => void;
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
  getAppConfig: () => Promise<AppConfig>;
  saveAppConfig: (config: AppConfig) => Promise<void>;
  /** Export all configs to a user-chosen .json file. Returns the path written, or null if cancelled. */
  exportConfigs: () => Promise<string | null>;
  /** Import configs from a .json file chosen by the user. Returns counts of added and skipped configs. */
  importConfigs: () => Promise<{ added: number; skipped: number }>;
  /** Load page size definitions — returns custom sizes from userData or the built-in defaults. */
  loadPageSizes: () => Promise<PageSize[]>;
  /** Ensure page-sizes.json exists in userData (writing defaults if needed), then open it in the OS editor. */
  openPageSizesFile: () => Promise<void>;
}

export interface AppApi {
  /** Returns the version string from package.json (via app.getVersion()). */
  getVersion: () => Promise<string>;
  /** Open a URL in the system default browser. */
  openExternal: (url: string) => Promise<void>;
  /** Subscribe to the native Help → About menu item. Returns an unsubscribe function. */
  onMenuAbout: (cb: () => void) => () => void;
}

export interface EditApi {
  /** Subscribe to Edit → Copy menu item (fired alongside native webContents.copy). Returns unsub fn. */
  onMenuCopy: (cb: () => void) => () => void;
  /** Subscribe to Edit → Cut menu item. Returns unsub fn. */
  onMenuCut: (cb: () => void) => () => void;
  /** Subscribe to Edit → Paste menu item. Returns unsub fn. */
  onMenuPaste: (cb: () => void) => () => void;
  /** Subscribe to Edit → Select All menu item. Returns unsub fn. */
  onMenuSelectAll: (cb: () => void) => () => void;
  /**
   * Notify the main process whether Copy/Cut should be enabled in the Edit menu.
   * Call with true when an import is selected, false when nothing is selected.
   */
  setHasSelection: (hasSelection: boolean) => void;
}

export interface TerraForgeAPI {
  fluidnc: FluidNCApi;
  serial: SerialApi;
  fs: FsApi;
  tasks: TasksApi;
  jobs: JobsApi;
  config: ConfigApi;
  app: AppApi;
  edit: EditApi;
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
