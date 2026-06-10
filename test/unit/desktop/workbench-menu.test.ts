import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESKTOP_COMMAND_CHANNELS } from "../../../apps/desktop/src/main/preload-contract.js";

const menuSource = () =>
  readFileSync(resolve("apps/desktop/src/main/workbench-menu.ts"), "utf8");
const mainSource = () =>
  readFileSync(resolve("apps/desktop/src/main/main.ts"), "utf8");

describe("desktop workbench menu", () => {
  it("sends a typed command palette event without script injection or raw renderer IPC", () => {
    const source = menuSource();

    expect(DESKTOP_COMMAND_CHANNELS.openCommandPalette).toBe(
      "desktop-command:open-command-palette",
    );
    expect(source).toContain('OPEN_COMMAND_PALETTE_ACCELERATOR = "CommandOrControl+K"');
    expect(source).toContain("label: \"Command Palette\"");
    expect(source).toContain("webContents.send(DESKTOP_COMMAND_CHANNELS.openCommandPalette)");
    expect(source).toContain("Menu.setApplicationMenu(menu)");
    expect(source).not.toContain("executeJavaScript");
    expect(source).not.toContain("ipcRenderer");
  });

  it("installs the workbench menu when the Electron app is ready", () => {
    const source = mainSource();

    expect(source).toContain('import { installWorkbenchMenu } from "./workbench-menu.js"');
    expect(source).toContain("installWorkbenchMenu();");
  });
});
