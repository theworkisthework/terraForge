import { useState, useRef, useEffect } from "react";
import { PenLine, Moon, Sun } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import TerraForgeLogotype from "../assets/terraForgeLogotype.svg?react";
import { useMachineStore } from "../store/machineStore";
import { useCanvasStore } from "../store/canvasStore";
import { selectToolbarCanvasState } from "../store/canvasSelectors";
import { useThemeStore } from "../store/themeStore";
import { MachineConfigDialog } from "./MachineConfigDialog";
import { GcodeOptionsDialog } from "./GcodeOptionsDialog";
import { CloseLayoutDialog } from "./CloseLayoutDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { AboutDialog } from "./AboutDialog";
import { useImportActions } from "../features/imports/hooks/useImportActions";
import { useLayoutActions } from "../features/layout/hooks/useLayoutActions";
import { useJobActions } from "../features/machine/hooks/useJobActions";

interface ToolbarProps {
  showJog?: boolean;
  onToggleJog?: () => void;
}

export function Toolbar({
  showJog = false,
  onToggleJog = () => {},
}: ToolbarProps = {}) {
  const configs = useMachineStore((s) => s.configs);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const setActiveConfigId = useMachineStore((s) => s.setActiveConfigId);
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);
  const fwInfo = useMachineStore((s) => s.fwInfo);

  const {
    imports,
    selectedImportId,
    clearImports,
    copyImport,
    cutImport,
    pasteImport,
    selectAllImports,
    clipboardImport,
    allImportsSelected,
    undo,
    redo,
    pageTemplate,
    setPageTemplate,
    pageSizes,
    setPageSizes,
  } = useCanvasStore(useShallow(selectToolbarCanvasState));

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const [showGcodeDialog, setShowGcodeDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // ── Extracted action hooks ────────────────────────────────────────────────
  const { handleImport } = useImportActions();

  const {
    handleSaveLayout,
    handleLoadLayout,
    handleCloseLayout,
    doCloseLayout,
    saveLayoutRef,
    loadLayoutRef,
    closeLayoutRef,
    showCloseDialog,
    setShowCloseDialog,
    pendingLayout,
    setPendingLayout,
  } = useLayoutActions();

  const {
    handleConnect,
    handleDisconnect,
    isConnecting,
    handleGenerateGcode,
    generating,
  } = useJobActions();

  // ── Edit clipboard — keep refs current for stable IPC/keyboard listeners ─
  const selectedImportIdRef = useRef(selectedImportId);
  const clipboardImportRef = useRef(clipboardImport);
  const allImportsSelectedRef = useRef(allImportsSelected);
  selectedImportIdRef.current = selectedImportId;
  clipboardImportRef.current = clipboardImport;
  allImportsSelectedRef.current = allImportsSelected;
  const copyImportRef = useRef(copyImport);
  const cutImportRef = useRef(cutImport);
  const pasteImportRef = useRef(pasteImport);
  const selectAllImportsRef = useRef(selectAllImports);
  const clearImportsRef = useRef(clearImports);
  copyImportRef.current = copyImport;
  cutImportRef.current = cutImport;
  pasteImportRef.current = pasteImport;
  selectAllImportsRef.current = selectAllImports;
  clearImportsRef.current = clearImports;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  /** Returns true if the event originates from a text editing element. */
  function isTextInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      (el as HTMLElement).isContentEditable
    );
  }

  /** Handle a copy request from menu or keyboard — canvas items only. */
  function handleEditCopy() {
    const id = selectedImportIdRef.current;
    if (id) copyImportRef.current(id);
  }

  /** Handle a cut request from menu or keyboard — canvas items only. */
  function handleEditCut() {
    if (allImportsSelectedRef.current) {
      clearImportsRef.current();
      return;
    }
    const id = selectedImportIdRef.current;
    if (id) cutImportRef.current(id);
  }

  /** Handle a paste request from menu or keyboard. */
  function handleEditPaste() {
    if (clipboardImportRef.current) pasteImportRef.current();
  }

  /** Handle select-all from menu or keyboard — canvas items only. */
  function handleEditSelectAll() {
    selectAllImportsRef.current();
  }

  // Subscribe to native File-menu → layout action events.
  useEffect(() => {
    const unsubImport = window.terraForge.fs.onMenuImport(() => handleImport());
    const unsubOpen = window.terraForge.fs.onMenuOpenLayout(() =>
      loadLayoutRef.current(),
    );
    const unsubSave = window.terraForge.fs.onMenuSaveLayout(() =>
      saveLayoutRef.current(),
    );
    const unsubClose = window.terraForge.fs.onMenuCloseLayout(() =>
      closeLayoutRef.current(),
    );
    const unsubAbout = window.terraForge.app.onMenuAbout(() =>
      setShowAbout(true),
    );

    // ── Edit menu events (fired alongside native webContents ops) ────────────
    const unsubCopy = window.terraForge.edit.onMenuCopy(() => {
      if (!isTextInputFocused()) handleEditCopy();
    });
    const unsubCut = window.terraForge.edit.onMenuCut(() => {
      if (!isTextInputFocused()) handleEditCut();
    });
    const unsubPaste = window.terraForge.edit.onMenuPaste(() => {
      if (!isTextInputFocused()) handleEditPaste();
    });
    const unsubSelectAll = window.terraForge.edit.onMenuSelectAll(() => {
      if (!isTextInputFocused()) handleEditSelectAll();
    });

    // ── Keyboard shortcuts — intercept only when no text field is focused ────
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (isTextInputFocused()) return;
      switch (e.key.toLowerCase()) {
        case "c":
          handleEditCopy();
          break;
        case "x":
          handleEditCut();
          break;
        case "v":
          handleEditPaste();
          break;
        case "a":
          handleEditSelectAll();
          e.preventDefault(); // prevent browser select-all of page text
          break;
        case "z":
          e.preventDefault();
          if (e.shiftKey) {
            redoRef.current();
          } else {
            undoRef.current();
          }
          break;
        case "y":
          e.preventDefault();
          redoRef.current();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      unsubImport();
      unsubOpen();
      unsubSave();
      unsubClose();
      unsubAbout();
      unsubCopy();
      unsubCut();
      unsubPaste();
      unsubSelectAll();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);  

  // Load custom page sizes from the main process on mount.
  // Falls back to the built-in defaults (already in the store) if IPC fails.
  useEffect(() => {
    window.terraForge.config
      .loadPageSizes()
      .then((sizes) => {
        if (sizes.length > 0) setPageSizes(sizes);
      })
      .catch(() => {
        /* keep built-in defaults */
      });
  }, []);  

  // Keep Save Layout / Close Layout menu items enabled only when there are imports.
  useEffect(() => {
    window.terraForge.fs.setLayoutMenuState(imports.length > 0);
  }, [imports.length]);

  // Keep Edit → Cut / Copy menu items enabled only when a canvas import is selected.
  useEffect(() => {
    window.terraForge.edit.setHasSelection(selectedImportId !== null);
  }, [selectedImportId]);

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-panel border-b border-border-ui shrink-0">
      {/* Brand */}
      <TerraForgeLogotype
        aria-label="terraForge"
        className="text-accent h-[22px] w-auto mr-2 shrink-0"
      />

      {/* Machine selector — locked while connected */}
      <select
        aria-label="Machine selector"
        className="bg-app border border-border-ui rounded px-2 py-1 text-sm text-content min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
        value={activeConfigId ?? ""}
        onChange={(e) => setActiveConfigId(e.target.value || null)}
        disabled={connected}
        title={connected ? "Disconnect before switching machine" : undefined}
      >
        <option value="">— Select machine —</option>
        {configs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Connect / disconnect */}
      {connected ? (
        <button
          onClick={handleDisconnect}
          className="px-3 py-1 rounded text-sm bg-secondary hover:bg-accent transition-colors"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={!activeConfigId || isConnecting}
          className="px-3 py-1 rounded text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors text-white flex items-center gap-1.5"
        >
          {isConnecting ? (
            <>
              <svg
                className="animate-spin h-3 w-3 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Connecting…
            </>
          ) : (
            "Connect"
          )}
        </button>
      )}

      <div className="h-4 w-px bg-border-ui" />

      {/* Import — SVG / PDF / G-code, detected from extension */}
      <button
        onClick={handleImport}
        className="px-3 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover transition-colors"
        title="Import an SVG, PDF, or G-code file"
      >
        Import
      </button>

      {/* Generate G-code — opens options dialog */}
      <button
        onClick={() => setShowGcodeDialog(true)}
        disabled={generating || imports.length === 0}
        className="px-3 py-1 rounded text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors text-white"
        title="Choose generation options then generate G-code"
      >
        {generating ? "Generating…" : "Generate G-code"}
      </button>

      {showGcodeDialog && (
        <GcodeOptionsDialog
          onConfirm={(prefs) => {
            setShowGcodeDialog(false);
            handleGenerateGcode(prefs);
          }}
          onCancel={() => setShowGcodeDialog(false)}
        />
      )}

      <div className="h-4 w-px bg-border-ui" />

      {/* ── Page Template ─────────────────────────────────────────────────────
           Shows a non-interactive page-size overlay on the canvas.
           Sizes come from the store (loaded from IPC / built-in defaults). */}
      <div className="flex items-center gap-1">
        <select
          className="bg-app border border-border-ui rounded px-2 py-1 text-sm text-content max-w-[110px]"
          value={pageTemplate?.sizeId ?? "none"}
          title="Page template — adds a size guide overlay to the canvas"
          onChange={(e) => {
            const id = e.target.value;
            if (id === "none") {
              setPageTemplate(null);
            } else {
              setPageTemplate({
                sizeId: id,
                landscape: pageTemplate?.landscape ?? true,
                marginMM: pageTemplate?.marginMM ?? 20,
              });
            }
          }}
        >
          <option value="none">No page</option>
          {pageSizes.map((ps) => (
            <option key={ps.id} value={ps.id}>
              {ps.name}
            </option>
          ))}
        </select>

        {/* Portrait / landscape toggle — only shown when a page is selected */}
        {pageTemplate && (
          <button
            onClick={() =>
              setPageTemplate({
                ...pageTemplate,
                landscape: !pageTemplate.landscape,
                marginMM: pageTemplate.marginMM ?? 20,
              })
            }
            className="w-7 h-7 rounded bg-secondary hover:bg-secondary-hover transition-colors flex items-center justify-center text-content-muted"
            title={
              pageTemplate.landscape
                ? "Landscape — click to switch to portrait"
                : "Portrait — click to switch to landscape"
            }
          >
            {pageTemplate.landscape ? (
              /* Landscape page icon */
              <svg
                width="16"
                height="12"
                viewBox="0 0 16 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1" />
              </svg>
            ) : (
              /* Portrait page icon */
              <svg
                width="11"
                height="15"
                viewBox="0 0 11 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="0.75" y="0.75" width="9.5" height="13.5" rx="1" />
              </svg>
            )}
          </button>
        )}

        {/* Margin input — only shown when a page is selected */}
        {pageTemplate && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={pageTemplate.marginMM ?? 20}
              onChange={(e) =>
                setPageTemplate({
                  ...pageTemplate,
                  marginMM: Math.max(
                    0,
                    Math.min(100, Number(e.target.value) || 0),
                  ),
                })
              }
              className="w-14 bg-app border border-border-ui rounded px-2 py-1 text-sm text-content text-right"
              title="Page margin in mm"
            />
            <span className="text-xs text-content-muted">mm</span>
          </div>
        )}

        {/* Edit custom page sizes file */}
        <button
          onClick={() => window.terraForge.config.openPageSizesFile()}
          className="w-7 h-7 rounded bg-secondary hover:bg-secondary-hover transition-colors flex items-center justify-center text-content-faint"
          title="Edit custom page sizes (opens page-sizes.json in your default editor)"
        >
          <PenLine size={12} />
        </button>
      </div>

      <div className="h-4 w-px bg-border-ui" />

      {/* Home */}
      <button
        onClick={() => window.terraForge.fluidnc.sendCommand("$H")}
        disabled={!connected}
        title="Run homing cycle ($H)"
        className="px-3 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover disabled:opacity-40 transition-colors"
      >
        Home
      </button>

      {/* Jog toggle */}
      <button
        onClick={onToggleJog}
        className={`px-3 py-1 rounded text-sm transition-colors ${showJog ? "bg-accent text-white" : "bg-secondary hover:bg-secondary-hover text-content"}`}
      >
        Jog
      </button>

      {/* Connection status indicator */}
      <div className="ml-auto flex items-center gap-3">
        {/* Firmware version — shown when connected and version was detected */}
        {connected && fwInfo && (
          <span
            className="text-xs text-gray-500 font-mono"
            title="Detected firmware version"
          >
            {fwInfo}
          </span>
        )}

        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            !connected
              ? "bg-content-faint"
              : wsLive
                ? "bg-green-400"
                : "bg-amber-400 animate-pulse"
          }`}
          title={
            !connected
              ? "Offline"
              : wsLive
                ? "Connected — WebSocket live"
                : "Connected — waiting for WebSocket"
          }
        />
        <span className="text-xs text-content-muted">
          {!connected ? "Offline" : wsLive ? "Connected" : "Connecting…"}
        </span>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          aria-pressed={theme === "light"}
          title={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          className="p-1.5 rounded bg-secondary hover:bg-secondary-hover transition-colors text-content-muted"
        >
          {theme === "dark" ? (
            <Sun size={14} aria-hidden="true" />
          ) : (
            <Moon size={14} aria-hidden="true" />
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Machine settings"
          title="Machine settings"
          className="px-2 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover transition-colors"
        >
          ⚙
        </button>
      </div>

      {showSettings && (
        <MachineConfigDialog onClose={() => setShowSettings(false)} />
      )}

      {showCloseDialog && (
        <CloseLayoutDialog
          importCount={imports.length}
          onSave={async () => {
            setShowCloseDialog(false);
            await handleSaveLayout();
            // Only clear canvas once save dialog resolves (user may cancel it).
            // We clear unconditionally because the user explicitly chose Save —
            // if they cancelled the file picker we still dismiss the close dialog.
            clearImports();
          }}
          onDiscard={doCloseLayout}
          onCancel={() => setShowCloseDialog(false)}
        />
      )}

      {pendingLayout !== null && (
        <ConfirmDialog
          title="Replace Canvas?"
          message={`The canvas already has ${imports.length} object${imports.length !== 1 ? "s" : ""}. Opening this layout will replace it.\n\nContinue?`}
          confirmLabel="Replace"
          onConfirm={() => {
            const { loadLayout } = useCanvasStore.getState();
            loadLayout(
              pendingLayout.imports,
              pendingLayout.layerGroups,
              pendingLayout.pageTemplate,
            );
            setPendingLayout(null);
          }}
          onCancel={() => setPendingLayout(null)}
        />
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </header>
  );
}
