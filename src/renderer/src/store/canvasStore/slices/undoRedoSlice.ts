import { captureDocument, MAX_HISTORY, type CanvasHistory } from "../history";
import type { CanvasState, CanvasStateCreator, HistoryEntry, UndoRedoSlice } from "../types";

// Undo restores the whole document — imports, layer groups and the page
// template — so that undoing "clear" or "load layout" brings all of it back.
//
// Entries are the store's own arrays, not copies: immer never changes state
// in place, so an old array stays as it was. Deep-copying instead took about
// a second per drag on a dense render (a halftone is a path per dot), both to
// copy and for immer to freeze the copy.

const restore = (state: CanvasState, entry: HistoryEntry) => {
  state.imports = entry.imports;
  state.layerGroups = entry.layerGroups;
  state.pageTemplate = entry.pageTemplate;
  state.revision = entry.revision;
};

// Undo/redo swaps the document, so keep the selection where its target still
// exists (a move/scale/rotate undo must not deselect) and drop it where it
// does not (e.g. undoing an import).
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
  if (
    state.selectedGroupId &&
    !state.layerGroups.some((group) => group.id === state.selectedGroupId)
  ) {
    state.selectedGroupId = null;
  }
};

const pushCapped = (stack: HistoryEntry[], entry: HistoryEntry) => {
  stack.push(entry);
  if (stack.length > MAX_HISTORY) stack.splice(0, stack.length - MAX_HISTORY);
};

export function createUndoRedoSlice(
  history: CanvasHistory,
): CanvasStateCreator<UndoRedoSlice> {
  return (set, get) => {
    /** Moves the document to the top entry of one stack, leaving where it
     *  was on the other. */
    const step = (from: "undoStack" | "redoStack", to: "undoStack" | "redoStack") => {
      // A gesture cut short by undo is recorded first, so undo reverses it.
      history.commitGesture();
      history.interrupt();
      const stack = get()[from];
      if (stack.length === 0) return;
      const target = stack[stack.length - 1];
      const current = captureDocument(get());
      set((state) => {
        restore(state, target);
        state[from].pop();
        pushCapped(state[to], current);
        reconcileSelection(state);
      });
    };

    return {
      undoStack: [],
      redoStack: [],
      revision: 0,
      savedRevision: 0,

      // Starting a gesture leaves the redo history alone: a click that moves
      // nothing is not an edit. Redo is dropped when a change is committed.
      snapshotForGesture: () => history.beginGesture(),
      commitGesture: () => history.commitGesture(),

      undo: () => step("undoStack", "redoStack"),
      redo: () => step("redoStack", "undoStack"),

      markSaved: (revision) =>
        set((state) => {
          state.savedRevision = revision ?? state.revision;
        }),
    };
  };
}
