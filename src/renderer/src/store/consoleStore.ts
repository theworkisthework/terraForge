import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface ConsoleState {
  lines: string[];
  maxLines: number;
  appendLine: (line: string) => void;
  clear: () => void;
}

export const useConsoleStore = create<ConsoleState>()(
  immer((set) => ({
    lines: [],
    maxLines: 500,

    appendLine: (line) =>
      set((state) => {
        state.lines.push(line);
        if (state.lines.length > state.maxLines) {
          state.lines.splice(0, state.lines.length - state.maxLines);
        }
      }),

    clear: () =>
      set((state) => {
        state.lines = [];
      }),
  })),
);
