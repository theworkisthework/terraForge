import { describe, it, expect, beforeEach } from "vitest";
import { useConsoleStore } from "../../../src/renderer/src/store/consoleStore";

beforeEach(() => {
  useConsoleStore.setState({ lines: [], maxLines: 500 });
});

describe("consoleStore", () => {
  it("starts empty", () => {
    expect(useConsoleStore.getState().lines).toEqual([]);
  });

  it("appends a line", () => {
    useConsoleStore.getState().appendLine("hello");
    expect(useConsoleStore.getState().lines).toEqual(["hello"]);
  });

  it("caps lines at maxLines and drops oldest", () => {
    useConsoleStore.setState({ maxLines: 3 });
    const store = useConsoleStore.getState();
    store.appendLine("a");
    store.appendLine("b");
    store.appendLine("c");
    store.appendLine("d");
    const lines = useConsoleStore.getState().lines;
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("b"); // "a" was dropped
  });

  it("clears all lines", () => {
    useConsoleStore.getState().appendLine("something");
    useConsoleStore.getState().clear();
    expect(useConsoleStore.getState().lines).toEqual([]);
  });
});
