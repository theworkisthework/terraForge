import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import TerraForgeLogotype from "../assets/terraForgeLogotype.svg?react";
import { useCanvasStore } from "../store/canvasStore";
import { selectToolbarCanvasState } from "../store/canvasSelectors";
import { useThemeStore } from "../store/themeStore";
import { useImportActions } from "../features/imports/hooks/useImportActions";
import { useLayoutActions } from "../features/layout/hooks/useLayoutActions";
import { useJobActions } from "../features/machine/hooks/useJobActions";
import { useEditKeyboardShortcuts } from "../hooks/useEditKeyboardShortcuts";
import { MachineSelector } from "./Toolbar/MachineSelector";
import { ImportActions } from "./Toolbar/ImportActions";
import { PageTemplateControls } from "./Toolbar/PageTemplateControls";
import { ConnectionStatus } from "./Toolbar/ConnectionStatus";
import { ToolbarDialogs } from "./Toolbar/ToolbarDialogs";
import { useCanvasStore as useCanvasStoreUntyped } from "../store/canvasStore";

interface ToolbarProps {
  showJog?: boolean;
  onToggleJog?: () => void;
}

export function Toolbar({
  showJog = false,
  onToggleJog = () => {},
}: ToolbarProps = {}) {
  // ── Machine store ─────────────────────────────────────────────────────────
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // ── Canvas store ──────────────────────────────────────────────────────────
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

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [showGcodeDialog, setShowGcodeDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // ── Action hooks ──────────────────────────────────────────────────────────
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

  // ── Edit keyboard shortcuts ──────────────────────────────────────────────
  useEditKeyboardShortcuts(
    { selectedImportId, clipboardImport, allImportsSelected },
    {
      copyImport,
      cutImport,
      pasteImport,
      selectAllImports,
      clearImports,
      undo,
      redo,
    },
  );

  // ── Menu IPC subscriptions (layout actions + import + about) ─────────────
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
    return () => {
      unsubImport();
      unsubOpen();
      unsubSave();
      unsubClose();
      unsubAbout();
    };
  }, []);

  // ── Load custom page sizes on mount ──────────────────────────────────────
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

  // ── Layout menu state ────────────────────────────────────────────────────
  useEffect(() => {
    window.terraForge.fs.setLayoutMenuState(imports.length > 0);
  }, [imports.length]);

  // ── Edit menu state ──────────────────────────────────────────────────────
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

      {/* Machine selector + connect/disconnect + home + jog */}
      <MachineSelector
        showJog={showJog}
        onToggleJog={onToggleJog}
        handleConnect={handleConnect}
        handleDisconnect={handleDisconnect}
        isConnecting={isConnecting}
      />

      {/* Import + Generate G-code buttons */}
      <div className="flex items-center gap-2">
        <ImportActions
          onImport={handleImport}
          onOpenGcodeDialog={() => setShowGcodeDialog(true)}
          generating={generating}
          importsEmpty={imports.length === 0}
        />
      </div>

      <div className="h-4 w-px bg-border-ui" />

      {/* Page template controls */}
      <PageTemplateControls
        pageTemplate={pageTemplate}
        pageSizes={pageSizes}
        setPageTemplate={setPageTemplate}
        setPageSizes={setPageSizes}
      />

      {/* Right side: status + firmware info + theme + settings */}
      <div className="ml-auto flex items-center gap-3">
        {/* Connection status indicator */}
        <ConnectionStatus />

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

        <button
          onClick={() => setShowSettings(true)}
          aria-label="Machine settings"
          title="Machine settings"
          className="px-2 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover transition-colors"
        >
          ⚙
        </button>
      </div>

      {/* Dialogs rendered at header level */}
      <ToolbarDialogs
        showGcodeDialog={showGcodeDialog}
        showSettings={showSettings}
        showAbout={showAbout}
        showCloseDialog={showCloseDialog}
        pendingLayout={pendingLayout}
        importCount={imports.length}
        onGcodeConfirm={(prefs) => {
          setShowGcodeDialog(false);
          handleGenerateGcode(prefs);
        }}
        onGcodeCancel={() => setShowGcodeDialog(false)}
        onSettingsClose={() => setShowSettings(false)}
        onAboutClose={() => setShowAbout(false)}
        onCloseLayoutSave={async () => {
          setShowCloseDialog(false);
          await handleSaveLayout();
          clearImports();
        }}
        onCloseLayoutDiscard={doCloseLayout}
        onCloseLayoutCancel={() => setShowCloseDialog(false)}
        onPendingLayoutConfirm={() => {
          const { loadLayout } = useCanvasStoreUntyped.getState();
          loadLayout(
            pendingLayout!.imports,
            pendingLayout!.layerGroups,
            pendingLayout!.pageTemplate,
          );
          setPendingLayout(null);
        }}
        onPendingLayoutCancel={() => setPendingLayout(null)}
      />
    </header>
  );
}
