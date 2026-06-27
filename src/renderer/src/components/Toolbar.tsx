import { useState } from "react";
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
import { ToolbarDialogs } from "./Toolbar/ToolbarDialogs";
import { ToolbarRightSection } from "./Toolbar/ToolbarRightSection";
import { useToolbarEffects } from "./Toolbar/useToolbarEffects";
import { useCanvasStore as useCanvasStoreUntyped } from "../store/canvasStore";

interface ToolbarProps {
  showJog?: boolean;
  onToggleJog?: () => void;
}

export function Toolbar({
  showJog = false,
  onToggleJog = () => {},
}: ToolbarProps = {}) {
  // ── Theme ────────────────────────────────────────────────────────────────
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

  // ── Side effects ─────────────────────────────────────────────────────────
  useToolbarEffects({
    handleImport,
    loadLayoutRef,
    saveLayoutRef,
    closeLayoutRef,
    setShowAbout,
    setPageSizes,
    importsLength: imports.length,
    selectedImportId,
  });

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

      {/* Right side: status + theme + settings */}
      <ToolbarRightSection
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
      />

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
