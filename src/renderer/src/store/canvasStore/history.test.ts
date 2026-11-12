import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { COALESCE_WINDOW_MS, MAX_HISTORY, coalesceKeyFor, createCanvasHistory, type CanvasHistory } from "./history";
import { hasUnsavedChanges, type CanvasState } from "./types";

/** A document and its stacks, with nothing else of the canvas store. */
function makeStore() {
  let history!: CanvasHistory;
  const store = create<CanvasState>()(
    immer((set, get) => {
      history = createCanvasHistory(set, get);
      return {
        imports: [],
        layerGroups: [],
        pageTemplate: null,
        undoStack: [],
        redoStack: [],
        revision: 0,
        savedRevision: 0,
      } as unknown as CanvasState;
    }),
  );
  return { store, history };
}

const imp = (id: string, x = 0) => ({ id, x, paths: [] }) as any;
const add = (id: string) => (state: CanvasState) => void state.imports.push(imp(id));
const moveTo = (x: number) => (state: CanvasState) => void (state.imports[0].x = x);

/** Ends the current turn of the event loop, as returning from an event handler does. */
const nextTurn = () => Promise.resolve();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("edit", () => {
  it("records the document as it was before the change", () => {
    const { store, history } = makeStore();
    history.edit(add("a"));

    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].imports).toEqual([]);
  });

  it("records nothing, and leaves redo alone, when the recipe changes nothing", () => {
    const { store, history } = makeStore();
    const later = { imports: [imp("z")], layerGroups: [], pageTemplate: null, revision: 3 };
    store.setState({ redoStack: [later] });

    history.edit(() => {});
    history.edit((state) => {
      state.selectedImportId = "a";
    });

    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().redoStack).toHaveLength(1);
    expect(store.getState().revision).toBe(0);
  });

  it("clears redo when a change is recorded", () => {
    const { store, history } = makeStore();
    store.setState({ redoStack: [{ imports: [], layerGroups: [], pageTemplate: null, revision: 3 }] });

    history.edit(add("a"));

    expect(store.getState().redoStack).toHaveLength(0);
  });

  it("makes one step of every change in the same turn", async () => {
    const { store, history } = makeStore();
    // One click hiding three paths
    history.edit(add("a"));
    history.edit(add("b"));
    history.edit(add("c"));
    expect(store.getState().undoStack).toHaveLength(1);

    await nextTurn();
    history.edit(add("d"));
    expect(store.getState().undoStack).toHaveLength(2);
    expect(store.getState().undoStack[1].imports).toHaveLength(3);
  });

  it("gives every recorded change a revision of its own", async () => {
    const { store, history } = makeStore();
    history.edit(add("a"));
    const first = store.getState().revision;
    await nextTurn();
    history.edit(add("b"));

    expect(first).not.toBe(0);
    expect(store.getState().revision).not.toBe(first);
    expect(store.getState().undoStack.map((entry) => entry.revision)).toEqual([0, first]);
  });

  it("keeps no more than MAX_HISTORY steps, dropping the oldest", async () => {
    const { store, history } = makeStore();
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      history.edit(add(`i${i}`));
      await nextTurn();
    }

    expect(store.getState().undoStack).toHaveLength(MAX_HISTORY);
    expect(store.getState().undoStack[0].imports).toHaveLength(5);
  });
});

describe("edit with a coalesce key", () => {
  const typing = async (history: CanvasHistory, values: number[], key: string | undefined, gapMs: number) => {
    for (const x of values) {
      history.edit(moveTo(x), key);
      await nextTurn();
      vi.advanceTimersByTime(gapMs);
    }
  };

  it("joins changes with the same key that follow each other closely", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    await typing(history, [1, 12, 125], "import:a:x", COALESCE_WINDOW_MS - 1);

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].imports[0].x).toBe(0);
    expect(store.getState().imports[0].x).toBe(125);
  });

  it("starts a new step after a pause", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    await typing(history, [1, 12], "import:a:x", COALESCE_WINDOW_MS + 1);

    expect(store.getState().undoStack).toHaveLength(2);
  });

  it("starts a new step for a different key", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    history.edit(moveTo(1), "import:a:x");
    await nextTurn();
    history.edit(moveTo(2), "import:a:y");

    expect(store.getState().undoStack).toHaveLength(2);
  });

  it("never joins a change without a key", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    await typing(history, [1, 2, 3], undefined, 0);

    expect(store.getState().undoStack).toHaveLength(3);
  });

  it("does not join a keyed change to a discrete one before it", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    history.edit(moveTo(1), "import:a:x");
    await nextTurn();
    history.edit(moveTo(2));
    await nextTurn();
    history.edit(moveTo(3), "import:a:x");

    expect(store.getState().undoStack).toHaveLength(3);
  });

  it("does not join across an undo", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    history.edit(moveTo(1), "import:a:x");
    await nextTurn();
    // What undo does: step back to the entry, and forget the open step.
    const [entry] = store.getState().undoStack;
    store.setState({ imports: entry.imports, revision: entry.revision, undoStack: [] });
    history.interrupt();
    history.edit(moveTo(2), "import:a:x");

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].imports[0].x).toBe(0);
  });
});

describe("coalesceKeyFor", () => {
  it("names the scope and the fields set, in a fixed order", () => {
    expect(coalesceKeyFor("import:a", { y: 2, x: 1 })).toBe("import:a:x,y");
  });

  it("gives no key to a patch that sets a boolean", () => {
    expect(coalesceKeyFor("import:a", { visible: false })).toBeUndefined();
    expect(coalesceKeyFor("import:a", { x: 1, visible: true })).toBeUndefined();
  });
});

describe("gestures", () => {
  it("make one step of everything changed between begin and commit", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    history.beginGesture();
    for (const x of [1, 2, 3]) {
      history.edit(moveTo(x));
      await nextTurn();
      // A slow drag is still one gesture
      vi.advanceTimersByTime(COALESCE_WINDOW_MS * 2);
    }
    expect(store.getState().undoStack).toHaveLength(0);
    history.commitGesture();

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].imports[0].x).toBe(0);
  });

  it("record nothing and keep redo when nothing changed", () => {
    const { store, history } = makeStore();
    store.setState({ redoStack: [{ imports: [], layerGroups: [], pageTemplate: null, revision: 3 }] });

    history.beginGesture();
    history.commitGesture();

    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().redoStack).toHaveLength(1);
    expect(store.getState().revision).toBe(0);
  });

  it("do not take in the change that follows the commit", async () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    history.beginGesture();
    history.edit(moveTo(1), "import:a:x");
    history.commitGesture();
    history.edit(moveTo(2), "import:a:x");

    expect(store.getState().undoStack).toHaveLength(2);
  });

  it("record a gesture that never ended when the next one begins", () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("a")] });

    history.beginGesture();
    history.edit(moveTo(1));
    history.beginGesture();
    history.edit(moveTo(2));
    history.commitGesture();

    expect(store.getState().undoStack.map((entry) => entry.imports[0].x)).toEqual([0, 1]);
  });
});

describe("hasUnsavedChanges", () => {
  it("is false for a new, empty canvas", () => {
    const { store } = makeStore();
    expect(hasUnsavedChanges(store.getState())).toBe(false);
  });

  it("is true once the document has been edited", () => {
    const { store, history } = makeStore();
    history.edit(add("a"));
    expect(hasUnsavedChanges(store.getState())).toBe(true);
  });

  it("is false once the edited document is the saved one", () => {
    const { store, history } = makeStore();
    history.edit(add("a"));
    store.setState({ savedRevision: store.getState().revision });
    expect(hasUnsavedChanges(store.getState())).toBe(false);
  });

  it("is false when everything has been removed: there is nothing to lose", () => {
    const { store, history } = makeStore();
    history.edit(add("a"));
    history.edit((state) => {
      state.imports = [];
    });
    expect(hasUnsavedChanges(store.getState())).toBe(false);
  });
});
