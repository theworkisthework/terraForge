/**
 * Stops the app closing over unsaved work.
 *
 * The renderer reports whether the canvas has changed since its layout was
 * last saved or loaded. While it has, closing the window or quitting asks
 * first; the layout is only thrown away if the user says so.
 */
import { dialog, ipcMain, type BrowserWindow } from "electron";

/** What the renderer last reported. */
let unsaved = false;
/** The user has agreed to lose the changes, and the close under way may go ahead. */
let discardConfirmed = false;
/** The question is on screen. */
let prompting = false;

const mustAsk = () => unsaved && !discardConfirmed;

export function registerUnsavedChangesHandlers(): void {
  ipcMain.on("app:setUnsavedChanges", (_event, value: unknown) => {
    unsaved = value === true;
    // An answer covers the changes it was given for, not later ones.
    discardConfirmed = false;
  });
}

/** Asks whether to lose the changes. Resolves true if the user agrees. */
async function confirmDiscard(win: BrowserWindow | null): Promise<boolean> {
  // A second attempt to close while the question is up is not a second question.
  if (prompting) return false;
  prompting = true;
  try {
    const options = {
      type: "warning" as const,
      buttons: ["Close without saving", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Unsaved layout",
      message: "Close without saving the layout?",
      detail: "The layout has changes that have not been saved. They will be lost if you close terraForge.",
    };
    const { response } =
      win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response !== 0) return false;
    discardConfirmed = true;
    return true;
  } finally {
    prompting = false;
  }
}

/**
 * Makes closing `win` ask first while there are unsaved changes. Returns
 * the window, so it can wrap the call that creates it.
 */
export function guardWindowClose(win: BrowserWindow): BrowserWindow {
  win.on("close", (event) => {
    if (!mustAsk()) return;
    event.preventDefault();
    void confirmDiscard(win).then((discard) => {
      if (discard && !win.isDestroyed()) win.close();
    });
  });
  win.on("closed", () => {
    // The canvas went with the window; one opened later starts empty.
    unsaved = false;
    discardConfirmed = false;
  });
  return win;
}

/**
 * For the app's `before-quit`: null if it may quit now, otherwise a promise
 * of the user's answer — true to quit and lose the changes.
 */
export function confirmQuit(win: BrowserWindow | null): Promise<boolean> | null {
  return mustAsk() ? confirmDiscard(win) : null;
}
