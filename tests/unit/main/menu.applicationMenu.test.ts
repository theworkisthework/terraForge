import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (...args: any[]) => void>();

  class MockBrowserWindow {
    webContents = {
      cut: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
    };
  }

  return {
    listeners,
    BrowserWindow: MockBrowserWindow,
    buildFromTemplate: vi.fn((template) => ({ template })),
    setApplicationMenu: vi.fn(),
    getApplicationMenu: vi.fn(),
    openExternal: vi.fn(),
    on: vi.fn((channel: string, handler: (...args: any[]) => void) => {
      listeners.set(channel, handler);
    }),
  };
});

vi.mock("electron", () => ({
  app: { name: "terraForge" },
  BrowserWindow: mocks.BrowserWindow,
  ipcMain: { on: mocks.on },
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
    setApplicationMenu: mocks.setApplicationMenu,
    getApplicationMenu: mocks.getApplicationMenu,
  },
  shell: { openExternal: mocks.openExternal },
}));

import {
  buildApplicationMenu,
  registerMenuStateHandlers,
} from "../../../src/main/menu/applicationMenu";

describe("application menu", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    mocks.buildFromTemplate.mockClear();
    mocks.setApplicationMenu.mockClear();
    mocks.getApplicationMenu.mockReset();
    mocks.openExternal.mockReset();
    mocks.on.mockClear();
  });

  it("builds the application menu and wires file/help actions", () => {
    const sendToRenderer = vi.fn();

    buildApplicationMenu(sendToRenderer);

    const template = mocks.buildFromTemplate.mock.calls[0][0] as any[];
    const fileMenu = template.find((item) => item.label === "File");
    const helpMenu = template.find((item) => item.role === "help");

    fileMenu.submenu[0].click();
    helpMenu.submenu[2].click();
    helpMenu.submenu[0].click();

    expect(sendToRenderer).toHaveBeenCalledWith("menu:import");
    expect(sendToRenderer).toHaveBeenCalledWith("menu:about");
    expect(mocks.openExternal).toHaveBeenCalledWith(
      expect.stringContaining("terraForge-user-guide.md"),
    );
    expect(mocks.setApplicationMenu).toHaveBeenCalledTimes(1);
  });

  it("wires edit cut/copy/paste actions to both webContents and renderer", () => {
    const sendToRenderer = vi.fn();
    buildApplicationMenu(sendToRenderer);

    const template = mocks.buildFromTemplate.mock.calls[0][0] as any[];
    const editMenu = template.find((item) => item.label === "Edit");
    const win = new mocks.BrowserWindow();

    editMenu.submenu[3].click({}, win);
    editMenu.submenu[4].click({}, win);
    editMenu.submenu[5].click({}, win);

    expect(win.webContents.cut).toHaveBeenCalledTimes(1);
    expect(win.webContents.copy).toHaveBeenCalledTimes(1);
    expect(win.webContents.paste).toHaveBeenCalledTimes(1);
    expect(sendToRenderer).toHaveBeenCalledWith("menu:editCut");
    expect(sendToRenderer).toHaveBeenCalledWith("menu:editCopy");
    expect(sendToRenderer).toHaveBeenCalledWith("menu:editPaste");
  });

  it("updates enabled state for layout and edit menu items", () => {
    const menuItems = {
      saveLayout: { enabled: false },
      closeLayout: { enabled: false },
      editCut: { enabled: false },
      editCopy: { enabled: false },
    };
    mocks.getApplicationMenu.mockReturnValue({
      getMenuItemById: (id: keyof typeof menuItems) => menuItems[id],
    });

    registerMenuStateHandlers();

    mocks.listeners.get("menu:setLayoutMenuState")?.({}, true);
    mocks.listeners.get("menu:setEditMenuState")?.({}, true);

    expect(menuItems.saveLayout.enabled).toBe(true);
    expect(menuItems.closeLayout.enabled).toBe(true);
    expect(menuItems.editCut.enabled).toBe(true);
    expect(menuItems.editCopy.enabled).toBe(true);
  });
});
