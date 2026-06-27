import { useEffect } from "react";

interface ToolbarEffectsParams {
  handleImport: () => void;
  loadLayoutRef: React.RefObject<() => void>;
  saveLayoutRef: React.RefObject<() => void>;
  closeLayoutRef: React.RefObject<() => void>;
  setShowAbout: (v: boolean) => void;
  setPageSizes: (sizes: { label: string; w: number; h: number }[]) => void;
  importsLength: number;
  selectedImportId: string | null;
}

/**
 * Consolidates all Toolbar side-effect subscriptions:
 * - Menu IPC listeners (import, layout, about)
 * - Custom page sizes load
 * - Layout menu state sync
 * - Edit menu state sync
 */
export function useToolbarEffects({
  handleImport,
  loadLayoutRef,
  saveLayoutRef,
  closeLayoutRef,
  setShowAbout,
  setPageSizes,
  importsLength,
  selectedImportId,
}: ToolbarEffectsParams) {
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
    window.terraForge.fs.setLayoutMenuState(importsLength > 0);
  }, [importsLength]);

  // ── Edit menu state ──────────────────────────────────────────────────────
  useEffect(() => {
    window.terraForge.edit.setHasSelection(selectedImportId !== null);
  }, [selectedImportId]);
}