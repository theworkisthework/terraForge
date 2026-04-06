import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";

type RendererMenuSender = (channel: string, ...args: unknown[]) => void;

export function buildApplicationMenu(sendToRenderer: RendererMenuSender): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          id: "import",
          label: "Import\u2026",
          accelerator: "CmdOrCtrl+I",
          click: () => sendToRenderer("menu:import"),
        },
        { type: "separator" as const },
        {
          id: "openLayout",
          label: "Open Layout…",
          accelerator: "CmdOrCtrl+O",
          click: () => sendToRenderer("menu:openLayout"),
        },
        {
          id: "saveLayout",
          label: "Save Layout",
          accelerator: "CmdOrCtrl+S",
          enabled: false,
          click: () => sendToRenderer("menu:saveLayout"),
        },
        {
          id: "closeLayout",
          label: "Close Layout",
          enabled: false,
          click: () => sendToRenderer("menu:closeLayout"),
        },
        { type: "separator" as const },
        ...(isMac ? [] : [{ role: "quit" as const }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        {
          id: "editCut",
          label: "Cut",
          accelerator: "CmdOrCtrl+X",
          enabled: false,
          click: (_item, win) => {
            if (win instanceof BrowserWindow) {
              win.webContents.cut();
            }
            sendToRenderer("menu:editCut");
          },
        },
        {
          id: "editCopy",
          label: "Copy",
          accelerator: "CmdOrCtrl+C",
          enabled: false,
          click: (_item, win) => {
            if (win instanceof BrowserWindow) {
              win.webContents.copy();
            }
            sendToRenderer("menu:editCopy");
          },
        },
        {
          id: "editPaste",
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          click: (_item, win) => {
            if (win instanceof BrowserWindow) {
              win.webContents.paste();
            }
            sendToRenderer("menu:editPaste");
          },
        },
        {
          id: "editSelectAll",
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          click: () => {
            sendToRenderer("menu:editSelectAll");
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      role: "help" as const,
      submenu: [
        {
          label: "User Guide",
          click: () =>
            shell.openExternal(
              "https://github.com/theworkisthework/terraForge/blob/main/docs/terraForge-user-guide.md",
            ),
        },
        { type: "separator" as const },
        {
          label: "About terraForge",
          click: () => sendToRenderer("menu:about"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function registerMenuStateHandlers(): void {
  ipcMain.on("menu:setLayoutMenuState", (_e, hasImports: boolean) => {
    const menu = Menu.getApplicationMenu();
    const save = menu?.getMenuItemById("saveLayout");
    const close = menu?.getMenuItemById("closeLayout");
    if (save) save.enabled = hasImports;
    if (close) close.enabled = hasImports;
  });

  ipcMain.on("menu:setEditMenuState", (_e, hasSelection: boolean) => {
    const menu = Menu.getApplicationMenu();
    const cut = menu?.getMenuItemById("editCut");
    const copy = menu?.getMenuItemById("editCopy");
    if (cut) cut.enabled = hasSelection;
    if (copy) copy.enabled = hasSelection;
  });
}
