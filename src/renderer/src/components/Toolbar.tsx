import { useState } from "react";
import { Ellipsis } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import TerraForgeLogotype from "../assets/terraForgeLogotype.svg?react";
import { useCanvasStore } from "../store/canvasStore";
import { selectToolbarCanvasState } from "../store/canvasSelectors";
import { useThemeStore } from "../store/themeStore";
import { useImportActions } from "../features/imports/hooks/useImportActions";
import { useLayoutActions } from "../features/layout/hooks/useLayoutActions";
import { useJobActions } from "../features/machine/hooks/useJobActions";
import { useEditKeyboardShortcuts } from "../hooks/useEditKeyboardShortcuts";
import { MachineSelector, HomeButton } from "./Toolbar/MachineSelector";
import { ImportActions } from "./Toolbar/ImportActions";
import { PageTemplateControls } from "./Toolbar/PageTemplateControls";
import { ToolbarDialogs } from "./Toolbar/ToolbarDialogs";
import { Button } from "./ui";
import { ConnectionStatus } from "./Toolbar/ConnectionStatus";
import { Moon, Settings, Sun } from "lucide-react";
import { ToolbarRightSection } from "./Toolbar/ToolbarRightSection";
import { useToolbarEffects } from "./Toolbar/useToolbarEffects";
import { useCanvasStore as useCanvasStoreUntyped } from "../store/canvasStore";

interface ToolbarProps {
  showJog?: boolean;
  onToggleJog?: () => void;
  /** Phone layout: slim connect row with the remaining tools in an expandable row. */
  mobile?: boolean;
}

export function Toolbar({
  showJog = false,
  onToggleJog = () => {},
  mobile = false,
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
  const [showTools, setShowTools] = useState(false);

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

  const mobileBar = (
    <>
      <div className="flex items-center gap-2 w-full">
        <MachineSelector
          compact
          showJog={showJog}
          onToggleJog={onToggleJog}
          handleConnect={handleConnect}
          handleDisconnect={handleDisconnect}
          isConnecting={isConnecting}
        />
        <Button
          variant="secondary"
          onClick={() => setShowTools((v) => !v)}
          aria-expanded={showTools}
          aria-label="More tools"
          title="More tools"
        >
          <Ellipsis size={16} aria-hidden="true" />
        </Button>
      </div>
      {showTools && (
        <div className="flex flex-wrap items-center gap-2 w-full">
          <HomeButton />
          <ImportActions
            onImport={handleImport}
            onOpenGcodeDialog={() => setShowGcodeDialog(true)}
            generating={generating}
            importsEmpty={imports.length === 0}
          />
          <PageTemplateControls
            pageTemplate={pageTemplate}
            pageSizes={pageSizes}
            setPageTemplate={setPageTemplate}
            setPageSizes={setPageSizes}
          />
          <div className="ml-auto flex items-center gap-2">
            <ConnectionStatus />
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSettings(true)}
              aria-label="Machine settings"
            >
              <Settings size={14} />
            </Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <header
      className={
        mobile
          ? "flex flex-col gap-2 px-3 py-2 bg-panel border-b border-border-ui shrink-0"
          : "flex items-center gap-3 px-4 py-2 bg-panel border-b border-border-ui shrink-0"
      }
    >
      {mobile ? (
        mobileBar
      ) : (
        <>
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
        </>
      )}

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
