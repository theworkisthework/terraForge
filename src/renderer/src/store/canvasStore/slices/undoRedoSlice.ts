import type { SvgImport } from "../../../../../types";
import type { CanvasState, CanvasStateCreator, UndoRedoSlice } from "../types";

// Holds a snapshot captured at gesture-start (drag/scale/rotate mousedown).
// Committed to undoStack on mouseup only if imports actually changed.
//
// Snapshots are the store's own `imports` arrays, not copies: immer never
// changes state in place, so an old array stays as it was. Deep-copying
// instead took about a second per drag on a dense render (a halftone is a
// path per dot), both to copy and for immer to freeze the copy.
let gestureSnapshot: SvgImport[] | null = null;

const gestureFingerprint = (imports: SvgImport[]) =>
  imports
    .map(
      (item) =>
        `${item.id}:${item.x},${item.y},${item.scale},${item.scaleX ?? ""},${item.scaleY ?? ""},${item.rotation ?? 0}`,
    )
    .join("|");

// Undo/redo swaps the imports array, so keep the selection where its target
// still exists (a move/scale/rotate undo must not deselect) and drop it
// where it does not (e.g. undoing an import).
const reconcileSelection = (state: CanvasState) => {
  const imp = state.imports.find((i) => i.id === state.selectedImportId);
  if (!imp) {
    state.selectedImportId = null;
    state.selectedPathId = null;
  } else if (
    state.selectedPathId &&
    !imp.paths.some((p) => p.id === state.selectedPathId)
  ) {
    state.selectedPathId = null;
  }
  if (state.imports.length === 0) state.allImportsSelected = false;
};

export const createUndoRedoSlice: CanvasStateCreator<UndoRedoSlice> = (
  set,
  get,
) => ({
  undoStack: [],
  redoStack: [],

  snapshotForGesture: () => {
    gestureSnapshot = get().imports;
    set((state) => {
      state.redoStack = [];
    });
  },

  commitGesture: () => {
    const before = gestureSnapshot;
    gestureSnapshot = null;
    if (!before) return;
    const current = get().imports;
    if (gestureFingerprint(before) === gestureFingerprint(current)) return;
    set((state) => {
      state.undoStack.push(before);
      if (state.undoStack.length > 50)
        state.undoStack.splice(0, state.undoStack.length - 50);
    });
  },

  undo: () => {
    const stack = get().undoStack;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    const currentSnap = get().imports;
    set((state) => {
      state.imports = prev;
      state.undoStack.pop();
      state.redoStack.push(currentSnap);
      if (state.redoStack.length > 50)
        state.redoStack.splice(0, state.redoStack.length - 50);
      reconcileSelection(state);
    });
  },

  redo: () => {
    const stack = get().redoStack;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    const currentSnap = get().imports;
    set((state) => {
      state.imports = next;
      state.redoStack.pop();
      state.undoStack.push(currentSnap);
      if (state.undoStack.length > 50)
        state.undoStack.splice(0, state.undoStack.length - 50);
      reconcileSelection(state);
    });
  },
});
