import { useRef, useEffect } from "react";

interface EditActions {
  copyImport: (id: string) => void;
  cutImport: (id: string) => void;
  pasteImport: () => void;
  selectAllImports: () => void;
  clearImports: () => void;
  undo: () => void;
  redo: () => void;
}

interface EditRefs {
  selectedImportId: string | null;
  clipboardImport: unknown;
  allImportsSelected: boolean;
}

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

/**
 * Handles Edit → Cut/Copy/Paste/SelectAll via both the native Edit menu
 * (IPC events) and keyboard shortcuts (Ctrl+C/X/V/A/Z/Y/Shift+Z).
 * Must be called inside a component that has access to the relevant store refs.
 */
export function useEditKeyboardShortcuts(
  refs: EditRefs,
  actions: EditActions,
) {
  const {
    selectedImportId,
    clipboardImport,
    allImportsSelected,
  } = refs;
  const {
    copyImport,
    cutImport,
    pasteImport,
    selectAllImports,
    clearImports,
    undo,
    redo,
  } = actions;

  // Stable refs so the effect dependencies don't cause re-subscriptions.
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

  useEffect(() => {
    function handleEditCopy() {
      const id = selectedImportIdRef.current;
      if (id) copyImportRef.current(id);
    }

    function handleEditCut() {
      if (allImportsSelectedRef.current) {
        clearImportsRef.current();
        return;
      }
      const id = selectedImportIdRef.current;
      if (id) cutImportRef.current(id);
    }

    function handleEditPaste() {
      if (clipboardImportRef.current) pasteImportRef.current();
    }

    function handleEditSelectAll() {
      selectAllImportsRef.current();
    }

    // Subscribe to native Edit-menu IPC events
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

    // Keyboard shortcuts — intercept only when no text field is focused
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
          e.preventDefault();
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
      unsubCopy();
      unsubCut();
      unsubPaste();
      unsubSelectAll();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}