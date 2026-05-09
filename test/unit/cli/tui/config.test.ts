import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TUI_CONFIG, loadTuiConfig } from "../../../../packages/cli/src/tui/config.js";

const tempDirs: string[] = [];
const oldEnv = process.env.KIRAKIRA_TUI_CONFIG;

afterEach(() => {
  process.env.KIRAKIRA_TUI_CONFIG = oldEnv;
  while (tempDirs.length > 0) {
    const d = tempDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function makeTempWorkspace(): string {
  const d = mkdtempSync(join(tmpdir(), "kirakira-tui-config-"));
  tempDirs.push(d);
  return d;
}

describe("tui config loader", () => {
  it("returns defaults when no config files exist", () => {
    const ws = makeTempWorkspace();
    const loaded = loadTuiConfig({ workspaceRoot: ws });
    expect(loaded.config.theme).toBe(DEFAULT_TUI_CONFIG.theme);
    expect(loaded.sources.length).toBe(0);
  });

  it("loads project .kirakira/tui.jsonc and normalizes fields", () => {
    const ws = makeTempWorkspace();
    const dir = join(ws, ".kirakira");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "tui.jsonc"),
      `{
        // project config
        "theme": "opencode-dark",
        "mouse": true,
        "diff_style": "stacked",
        "scroll_speed": 5,
        "sidebar": { "default_open": false, "width": 40 },
        "timeline": { "tool_details": "full", "show_reasoning": "model" },
        "keybinds": { "leader": "ctrl+x" }
      }`,
      "utf8",
    );

    const loaded = loadTuiConfig({ workspaceRoot: ws });
    expect(loaded.config.theme).toBe("opencode-dark");
    expect(loaded.config.diffStyle).toBe("stacked");
    expect(loaded.config.scrollSpeed).toBe(5);
    expect(loaded.config.sidebar.defaultOpen).toBe(false);
    expect(loaded.config.sidebar.width).toBe(40);
    expect(loaded.config.timeline.toolDetails).toBe("full");
    expect(loaded.config.timeline.showReasoning).toBe("model");
    expect(loaded.sources.length).toBeGreaterThan(0);
  });

  it("applies CLI overrides for theme and no-mouse", () => {
    const ws = makeTempWorkspace();
    const loaded = loadTuiConfig({
      workspaceRoot: ws,
      themeOverride: "opencode-light",
      noMouse: true,
    });
    expect(loaded.config.theme).toBe("opencode-light");
    expect(loaded.config.mouse).toBe(false);
  });
});
