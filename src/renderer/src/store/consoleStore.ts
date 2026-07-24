import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { useAppConfigStore } from "./appConfigStore";

function formatConsoleTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

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
        const showConsoleTimestamps =
          useAppConfigStore.getState().showConsoleTimestamps;
        state.lines.push(
          showConsoleTimestamps
            ? `[${formatConsoleTimestamp(new Date())}] ${line}`
            : line,
        );
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
