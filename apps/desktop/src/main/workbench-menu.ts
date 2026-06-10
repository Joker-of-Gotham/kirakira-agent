import {
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import { DESKTOP_COMMAND_CHANNELS } from "./preload-contract.js";

export const OPEN_COMMAND_PALETTE_ACCELERATOR = "CommandOrControl+K";

export interface WorkbenchCommandWindow {
  readonly webContents: Pick<WebContents, "send">;
  isDestroyed(): boolean;
}

export interface WorkbenchMenuOptions {
  getFocusedWindow?: () => BrowserWindow | null;
}

function isWorkbenchCommandWindow(value: unknown): value is WorkbenchCommandWindow {
  return Boolean(
    value &&
      typeof value === "object" &&
      "webContents" in value &&
      "isDestroyed" in value,
  );
}

export function sendOpenCommandPaletteCommand(
  window: WorkbenchCommandWindow | null | undefined,
): boolean {
  if (!window || window.isDestroyed()) return false;
  window.webContents.send(DESKTOP_COMMAND_CHANNELS.openCommandPalette);
  return true;
}

export function buildWorkbenchMenuTemplate(
  options: WorkbenchMenuOptions = {},
): MenuItemConstructorOptions[] {
  const getFocusedWindow = options.getFocusedWindow ?? (() => BrowserWindow.getFocusedWindow());
  const openFocusedCommandPalette: NonNullable<MenuItemConstructorOptions["click"]> = (
    _menuItem,
    focusedWindow,
  ) => {
    const target = isWorkbenchCommandWindow(focusedWindow)
      ? focusedWindow
      : getFocusedWindow();
    sendOpenCommandPaletteCommand(target);
  };
  const commandPaletteItem: MenuItemConstructorOptions = {
    label: "Command Palette",
    accelerator: OPEN_COMMAND_PALETTE_ACCELERATOR,
    click: openFocusedCommandPalette,
  };
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === "darwin") {
    template.push({
      label: "Kirakira Agent",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push(
    {
      label: "Commands",
      submenu: [commandPaletteItem],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
      ],
    },
  );

  return template;
}

export function installWorkbenchMenu(options: WorkbenchMenuOptions = {}): Menu {
  const menu = Menu.buildFromTemplate(buildWorkbenchMenuTemplate(options));
  Menu.setApplicationMenu(menu);
  return menu;
}
