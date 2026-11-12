import type { Draft } from "immer";
import type { CanvasDocument, CanvasState, HistoryEntry } from "./types";

/** Undo and redo each keep this many steps. */
export const MAX_HISTORY = 50;

/**
 * Edits of one property arriving this close together are one undo step: a
 * number typed digit by digit, a slider or colour picker dragged.
 */
export const COALESCE_WINDOW_MS = 1000;

type Recipe = (state: Draft<CanvasState>) => void;

export interface CanvasHistory {
  /**
   * Applies a change to the document and records it for undo, unless it
   * changed nothing.
   *
   * Changes made in the same turn of the event loop are one step: a single
   * click that updates forty paths is undone with a single undo. `coalesceKey`
   * extends that across turns for continuous edits — a change with the same
   * key as the last, within COALESCE_WINDOW_MS of it, joins its step. Leave
   * it out for a discrete action (a toggle, a delete), which is always a step
   * of its own.
   */
  edit: (recipe: Recipe, coalesceKey?: string) => void;
  /** Starts a gesture: every edit until `commitGesture` is one undo step. */
  beginGesture: () => void;
  /** Ends the gesture, recording a step if anything changed during it. */
  commitGesture: () => void;
  /** Forgets what the last edit was, so the next one starts a new step. */
  interrupt: () => void;
}

/** The current document, by reference: immer never changes state in place,
 * so the arrays held here stay as they were (see undoRedoSlice). */
export const captureDocument = (state: CanvasState): HistoryEntry => ({
  imports: state.imports,
  layerGroups: state.layerGroups,
  pageTemplate: state.pageTemplate,
  revision: state.revision,
});

const differs = (a: CanvasDocument, b: CanvasDocument) =>
  a.imports !== b.imports || a.layerGroups !== b.layerGroups || a.pageTemplate !== b.pageTemplate;

// Shared by every history, so that a revision number is never reused.
let nextRevision = 1;

/**
 * A key for `edit` from the fields a patch sets, or undefined if the patch
 * flips a boolean — a toggle is a discrete step however fast it is repeated.
 */
export function coalesceKeyFor(scope: string, patch: object): string | undefined {
  if (Object.values(patch).some((value) => typeof value === "boolean")) return undefined;
  return `${scope}:${Object.keys(patch).sort().join(",")}`;
}

export function createCanvasHistory(
  set: (recipe: Recipe) => void,
  get: () => CanvasState,
): CanvasHistory {
  /** The step the most recent edit went into, while later edits may join it. */
  let open: {
    /** The revision that edit left the document at: nothing has happened since if it is still current. */
    revision: number;
    at: number;
    /** Keys of the edits made in its turn; null if any of them was discrete. */
    keys: Set<string> | null;
    /** Still within the turn of the event loop that made the edit. */
    sameTurn: boolean;
  } | null = null;

  let gesture: { before: HistoryEntry; changed: boolean } | null = null;

  /** Moves the document on to a new revision, recording `before` (if given) as a step to undo to. */
  const commit = (before: HistoryEntry | null) =>
    set((state) => {
      state.revision = nextRevision++;
      if (before) {
        state.undoStack.push(before);
        if (state.undoStack.length > MAX_HISTORY) state.undoStack.splice(0, state.undoStack.length - MAX_HISTORY);
      }
      // Any new edit invalidates the redo history.
      if (state.redoStack.length > 0) state.redoStack = [];
    });

  const edit: CanvasHistory["edit"] = (recipe, coalesceKey) => {
    const before = captureDocument(get());
    set(recipe);
    if (!differs(before, get())) return;
    if (gesture) {
      gesture.changed = true;
      return;
    }

    const now = Date.now();
    const last = open?.revision === before.revision ? open : null;
    const joinsTurn = last?.sameTurn === true;
    const joinsKey =
      coalesceKey !== undefined && last?.keys?.has(coalesceKey) === true && now - last.at <= COALESCE_WINDOW_MS;
    commit(joinsTurn || joinsKey ? null : before);

    const keys: Set<string> | null = joinsTurn && last ? last.keys : new Set<string>();
    const step = {
      revision: get().revision,
      at: now,
      keys: coalesceKey === undefined || keys === null ? null : keys.add(coalesceKey),
      sameTurn: true,
    };
    open = step;
    // A microtask runs once the code handling the current event has returned.
    queueMicrotask(() => {
      step.sameTurn = false;
    });
  };

  const commitGesture = () => {
    const finished = gesture;
    gesture = null;
    if (!finished?.changed) return;
    open = null;
    commit(finished.before);
  };

  return {
    edit,
    beginGesture: () => {
      // A gesture whose mouse-up never arrived must not swallow this one.
      commitGesture();
      gesture = { before: captureDocument(get()), changed: false };
    },
    commitGesture,
    interrupt: () => {
      open = null;
    },
  };
}
