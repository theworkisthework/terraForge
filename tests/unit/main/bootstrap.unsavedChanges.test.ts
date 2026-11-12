import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: any[]) => void>(),
  showMessageBox: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    on: (channel: string, handler: (...args: any[]) => void) => mocks.ipcHandlers.set(channel, handler),
  },
  dialog: { showMessageBox: mocks.showMessageBox },
}));

import {
  confirmQuit,
  guardWindowClose,
  registerUnsavedChangesHandlers,
} from "../../../src/main/bootstrap/unsavedChanges";

const CLOSE_WITHOUT_SAVING = 0;
const CANCEL = 1;

/** A window whose `close()` runs the close handlers, as Electron's does. */
function fakeWindow() {
  const handlers = new Map<string, (event: { preventDefault: () => void }) => void>();
  const win = {
    closed: false,
    on: (event: string, handler: (event: { preventDefault: () => void }) => void) => handlers.set(event, handler),
    isDestroyed: () => win.closed,
    /** Resolves to whether the window closed. */
    close: vi.fn(() => {
      let prevented = false;
      handlers.get("close")?.({ preventDefault: () => (prevented = true) });
      if (prevented) return false;
      win.closed = true;
      handlers.get("closed")?.({ preventDefault: () => {} });
      return true;
    }),
  };
  return win;
}

const report = (unsaved: unknown) => mocks.ipcHandlers.get("app:setUnsavedChanges")?.({}, unsaved);
/** Lets the answer to the dialog be acted on. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("unsaved changes guard", () => {
  beforeEach(() => {
    mocks.ipcHandlers.clear();
    mocks.showMessageBox.mockReset();
    registerUnsavedChangesHandlers();
    report(false);
  });

  it("closes a window with nothing unsaved without asking", () => {
    const win = fakeWindow();
    guardWindowClose(win as any);

    expect(win.close()).toBe(true);
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  it("returns the window it guards", () => {
    const win = fakeWindow();
    expect(guardWindowClose(win as any)).toBe(win);
  });

  it("holds the close and asks when there are unsaved changes", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: CANCEL });
    const win = fakeWindow();
    guardWindowClose(win as any);
    report(true);

    expect(win.close()).toBe(false);
    await settle();

    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    const [parent, options] = mocks.showMessageBox.mock.calls[0];
    expect(parent).toBe(win);
    expect(options.buttons).toEqual(["Close without saving", "Cancel"]);
    // Enter and Escape both keep the layout.
    expect(options.defaultId).toBe(CANCEL);
    expect(options.cancelId).toBe(CANCEL);
    expect(win.closed).toBe(false);
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it("asks again the next time, after a cancel", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: CANCEL });
    const win = fakeWindow();
    guardWindowClose(win as any);
    report(true);

    win.close();
    await settle();
    win.close();
    await settle();

    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
    expect(win.closed).toBe(false);
  });

  it("closes the window when the user chooses to lose the changes", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: CLOSE_WITHOUT_SAVING });
    const win = fakeWindow();
    guardWindowClose(win as any);
    report(true);

    win.close();
    await settle();

    expect(win.closed).toBe(true);
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it("does not ask twice while the question is on screen", async () => {
    let answer!: (value: { response: number }) => void;
    mocks.showMessageBox.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const win = fakeWindow();
    guardWindowClose(win as any);
    report(true);

    win.close();
    win.close();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    expect(win.closed).toBe(false);

    answer({ response: CLOSE_WITHOUT_SAVING });
    await settle();
    expect(win.closed).toBe(true);
  });

  it("stops asking once the renderer reports the layout saved", () => {
    const win = fakeWindow();
    guardWindowClose(win as any);
    report(true);
    report(false);

    expect(win.close()).toBe(true);
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  it("treats anything but true from the renderer as nothing unsaved", () => {
    const win = fakeWindow();
    guardWindowClose(win as any);
    report("yes");

    expect(win.close()).toBe(true);
  });

  it("forgets the unsaved changes of a window that has closed", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: CLOSE_WITHOUT_SAVING });
    const first = fakeWindow();
    guardWindowClose(first as any);
    report(true);
    first.close();
    await settle();
    expect(first.closed).toBe(true);

    // macOS: the app stays open, and a new window starts with an empty canvas.
    const second = fakeWindow();
    guardWindowClose(second as any);
    expect(second.close()).toBe(true);
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it("asks again about changes made after an answer was given", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: CLOSE_WITHOUT_SAVING });
    report(true);
    await confirmQuit(null);
    // The quit did not go through, and the layout changed again.
    report(true);

    expect(confirmQuit(null)).not.toBeNull();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
  });

  describe("confirmQuit", () => {
    it("lets the app quit when nothing is unsaved", () => {
      expect(confirmQuit(null)).toBeNull();
      expect(mocks.showMessageBox).not.toHaveBeenCalled();
    });

    it("asks, and answers false on cancel", async () => {
      mocks.showMessageBox.mockResolvedValue({ response: CANCEL });
      report(true);

      await expect(confirmQuit(null)).resolves.toBe(false);
      // No window to attach to: the dialog is shown on its own.
      expect(mocks.showMessageBox.mock.calls[0]).toHaveLength(1);
    });

    it("answers true on confirm, then lets the quit and the window close through", async () => {
      mocks.showMessageBox.mockResolvedValue({ response: CLOSE_WITHOUT_SAVING });
      const win = fakeWindow();
      guardWindowClose(win as any);
      report(true);

      await expect(confirmQuit(win as any)).resolves.toBe(true);
      expect(confirmQuit(win as any)).toBeNull();
      expect(win.close()).toBe(true);
      expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    });
  });
});
