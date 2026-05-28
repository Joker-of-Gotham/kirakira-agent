import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { TuiMode } from "./types.js";

/* ── Layer 1: Primitive color scales (never used directly) ──── */

const primitive = {
  gray: {
    1: "#050505", 2: "#0A0A0A", 3: "#111111", 4: "#151515",
    5: "#1A1A1A", 6: "#1F1F1F", 7: "#282828", 8: "#3A3A3A",
    9: "#5F5F5F", 10: "#8A8A8A", 11: "#B0B0B0", 12: "#E7E7E7",
  },
  blue:   { 5: "#1A3A5C", 7: "#2D6FB5", 9: "#62A8FF", 11: "#A3D0FF" },
  green:  { 5: "#0F2D1A", 7: "#3B8C5A", 9: "#7DDC9A", 11: "#B8F0CC" },
  red:    { 5: "#35101F", 7: "#B83D5E", 9: "#FF5F87", 11: "#FFB3C7" },
  amber:  { 5: "#2D1F0A", 7: "#B8862D", 9: "#E8B45E", 11: "#FFD899" },
  purple: { 5: "#1F0F2D", 7: "#8B5CB8", 9: "#D58CFF", 11: "#EBC7FF" },
  cyan:   { 5: "#0A2D2D", 7: "#4A9FB8", 9: "#7AD7FF", 11: "#C0EDFF" },
} as const;

/* ── Layer 2: Semantic tokens (consumed by components) ──────── */

export interface SemanticTokens {
  surface: { base: string; raised: string; overlay: string; sunken: string };
  border:  { subtle: string; default: string; strong: string };
  text:    { primary: string; secondary: string; tertiary: string; inverse: string };
  accent:  { default: string; muted: string; subtle: string };
  status:  { success: string; warning: string; error: string; info: string };
  memory: string;
  reasoning: string;
  tool: string;
  approval: string;
  diff: { add: string; del: string };
}

function buildMidnightSemantic(): SemanticTokens {
  return {
    surface: {
      base:    primitive.gray[1],
      raised:  primitive.gray[3],
      overlay: primitive.gray[4],
      sunken:  primitive.gray[2],
    },
    border: {
      subtle:  primitive.gray[7],
      default: primitive.gray[8],
      strong:  primitive.blue[7],
    },
    text: {
      primary:   primitive.gray[12],
      secondary: primitive.gray[10],
      tertiary:  primitive.gray[9],
      inverse:   primitive.gray[1],
    },
    accent: {
      default: primitive.blue[9],
      muted:   primitive.blue[7],
      subtle:  primitive.blue[5],
    },
    status: {
      success: primitive.green[9],
      warning: primitive.amber[9],
      error:   primitive.red[9],
      info:    primitive.cyan[9],
    },
    memory:    primitive.cyan[9],
    reasoning: primitive.purple[9],
    tool:      primitive.blue[9],
    approval:  primitive.amber[9],
    diff: { add: primitive.green[9], del: primitive.red[9] },
  };
}

/* ── ThemeColors: flat interface consumed by all components ──── */

export interface ThemeColors {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  brand: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  user: string;
  agent: string;
  tool: string;
  system: string;
  memory: string;

  surfaceRaised: string;
  surfaceOverlay: string;
  surfaceSunken: string;
  borderDefault: string;
  borderStrong: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  accentMuted: string;
  accentSubtle: string;
  info: string;
  reasoning: string;
  approval: string;
  diffAdd: string;
  diffDel: string;
}

export interface TuiTheme {
  name: string;
  mode: "dark" | "light";
  colors: ThemeColors;
}

/* ── Helper: build ThemeColors from SemanticTokens ──────────── */

function colorsFromSemantic(s: SemanticTokens): ThemeColors {
  return {
    bg:             s.surface.base,
    fg:             s.text.primary,
    muted:          s.text.secondary,
    border:         s.border.subtle,
    brand:          s.accent.default,
    primary:        s.accent.default,
    success:        s.status.success,
    warning:        s.status.warning,
    danger:         s.status.error,
    user:           s.accent.default,
    agent:          s.memory,
    tool:           s.tool,
    system:         s.text.tertiary,
    memory:         s.memory,
    surfaceRaised:  s.surface.raised,
    surfaceOverlay: s.surface.overlay,
    surfaceSunken:  s.surface.sunken,
    borderDefault:  s.border.default,
    borderStrong:   s.border.strong,
    textSecondary:  s.text.secondary,
    textTertiary:   s.text.tertiary,
    textInverse:    s.text.inverse,
    accentMuted:    s.accent.muted,
    accentSubtle:   s.accent.subtle,
    info:           s.status.info,
    reasoning:      s.reasoning,
    approval:       s.approval,
    diffAdd:        s.diff.add,
    diffDel:        s.diff.del,
  };
}

/* ── Built-in theme presets ─────────────────────────────────── */

const BUILTIN_THEMES: Record<string, TuiTheme> = {
  kirakira: {
    name: "kirakira",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#141111", raised: "#302A2A", overlay: "#3A3434", sunken: "#211C1C" },
      border:  { subtle: "#4A4040", default: "#625656", strong: "#D7A4B0" },
      text:    { primary: "#F3EEEA", secondary: "#D3C8C2", tertiary: "#9F918C", inverse: "#141111" },
      accent:  { default: "#D7A4B0", muted: "#E4B9C2", subtle: "#433135" },
      status:  { success: "#A9BDA4", warning: "#CDBA91", error: "#D9A0A0", info: "#9FB8BC" },
      memory: "#A2BEB4", reasoning: "#C5B1C9", tool: "#A5B7C8", approval: "#D4B88F",
      diff: { add: "#AFC5A9", del: "#D9A0A0" },
    }),
  },

  opencode: {
    name: "opencode",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#0A0A0A", raised: "#141414", overlay: "#1E1E1E", sunken: "#0A0A0A" },
      border:  { subtle: "#3C3C3C", default: "#484848", strong: "#606060" },
      text:    { primary: "#EEEEEE", secondary: "#B8B8B8", tertiary: "#808080", inverse: "#0A0A0A" },
      accent:  { default: "#FAB283", muted: "#FFC09F", subtle: "#282828" },
      status:  { success: "#7FD88F", warning: "#F5A742", error: "#E06C75", info: "#56B6C2" },
      memory: "#56B6C2", reasoning: "#9D7CD8", tool: "#5C9CF5", approval: "#F5A742",
      diff: { add: "#4FD6BE", del: "#C53B53" },
    }),
  },

  catppuccin: {
    name: "catppuccin",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#1E1E2E", raised: "#313244", overlay: "#45475A", sunken: "#181825" },
      border:  { subtle: "#45475A", default: "#585B70", strong: "#89B4FA" },
      text:    { primary: "#CDD6F4", secondary: "#A6ADC8", tertiary: "#7F849C", inverse: "#11111B" },
      accent:  { default: "#89B4FA", muted: "#74C7EC", subtle: "#313244" },
      status:  { success: "#A6E3A1", warning: "#F9E2AF", error: "#F38BA8", info: "#94E2D5" },
      memory: "#94E2D5", reasoning: "#CBA6F7", tool: "#89B4FA", approval: "#FAB387",
      diff: { add: "#A6E3A1", del: "#F38BA8" },
    }),
  },

  "tokyo-night": {
    name: "tokyo-night",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#1A1B26", raised: "#24283B", overlay: "#2F3549", sunken: "#16161E" },
      border:  { subtle: "#3B4261", default: "#565F89", strong: "#7AA2F7" },
      text:    { primary: "#C0CAF5", secondary: "#A9B1D6", tertiary: "#6B7394", inverse: "#16161E" },
      accent:  { default: "#7AA2F7", muted: "#7DCFFF", subtle: "#283457" },
      status:  { success: "#9ECE6A", warning: "#E0AF68", error: "#F7768E", info: "#7DCFFF" },
      memory: "#7DCFFF", reasoning: "#BB9AF7", tool: "#73DACA", approval: "#E0AF68",
      diff: { add: "#9ECE6A", del: "#F7768E" },
    }),
  },

  nord: {
    name: "nord",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#2E3440", raised: "#3B4252", overlay: "#434C5E", sunken: "#242933" },
      border:  { subtle: "#4C566A", default: "#5E81AC", strong: "#88C0D0" },
      text:    { primary: "#ECEFF4", secondary: "#D8DEE9", tertiary: "#A7B1C2", inverse: "#2E3440" },
      accent:  { default: "#88C0D0", muted: "#81A1C1", subtle: "#3B5366" },
      status:  { success: "#A3BE8C", warning: "#EBCB8B", error: "#BF616A", info: "#8FBCBB" },
      memory: "#8FBCBB", reasoning: "#B48EAD", tool: "#88C0D0", approval: "#D08770",
      diff: { add: "#A3BE8C", del: "#BF616A" },
    }),
  },

  graphite: {
    name: "graphite",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#0B0D10", raised: "#151922", overlay: "#1B202A", sunken: "#080A0D" },
      border:  { subtle: "#232936", default: "#343C4A", strong: "#7AA2F7" },
      text:    { primary: "#E6EAF0", secondary: "#9AA4B2", tertiary: "#677080", inverse: "#0B0D10" },
      accent:  { default: "#7AA2F7", muted: "#5E7FC4", subtle: "#20304A" },
      status:  { success: "#8FD694", warning: "#E6B450", error: "#F7768E", info: "#7DCFFF" },
      memory: "#7DCFFF", reasoning: "#BB9AF7", tool: "#9ECE6A", approval: "#E6B450",
      diff: { add: "#8FD694", del: "#F7768E" },
    }),
  },

  midnight: {
    name: "midnight",
    mode: "dark",
    colors: colorsFromSemantic(buildMidnightSemantic()),
  },

  "deep-ocean": {
    name: "deep-ocean",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#0A0D12", raised: "#111822", overlay: "#161E2A", sunken: "#080B0F" },
      border:  { subtle: "#1E2A3A", default: "#2A3A4E", strong: "#2D6FB5" },
      text:    { primary: "#D8E0EC", secondary: "#7A8A9E", tertiary: "#4E5E72", inverse: "#0A0D12" },
      accent:  { default: "#5C9AE8", muted: "#3A6AAB", subtle: "#1A3A5C" },
      status:  { success: "#6BC890", warning: "#D4A54A", error: "#E85A78", info: "#6AB8D8" },
      memory: "#6AB8D8", reasoning: "#B87AD8", tool: "#5C9AE8", approval: "#D4A54A",
      diff: { add: "#6BC890", del: "#E85A78" },
    }),
  },

  paper: {
    name: "paper",
    mode: "light",
    colors: colorsFromSemantic({
      surface: { base: "#FAFAF8", raised: "#FFFFFF", overlay: "#F0F0EC", sunken: "#EDEDEA" },
      border:  { subtle: "#D8D8D0", default: "#B8B8B0", strong: "#2D6FB5" },
      text:    { primary: "#1A1A1A", secondary: "#5A5A5A", tertiary: "#8A8A8A", inverse: "#FAFAF8" },
      accent:  { default: "#2D6FB5", muted: "#4A8AD0", subtle: "#D0E0F0" },
      status:  { success: "#2D8C4E", warning: "#A87A20", error: "#C03050", info: "#2A7A9E" },
      memory: "#2A7A9E", reasoning: "#6A3D8C", tool: "#2D6FB5", approval: "#A87A20",
      diff: { add: "#2D8C4E", del: "#C03050" },
    }),
  },

  "high-contrast": {
    name: "high-contrast",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#000000", raised: "#0A0A0A", overlay: "#111111", sunken: "#000000" },
      border:  { subtle: "#444444", default: "#888888", strong: "#FFFFFF" },
      text:    { primary: "#FFFFFF", secondary: "#CCCCCC", tertiary: "#888888", inverse: "#000000" },
      accent:  { default: "#66BBFF", muted: "#3399DD", subtle: "#113355" },
      status:  { success: "#44FF88", warning: "#FFCC44", error: "#FF4466", info: "#44DDFF" },
      memory: "#44DDFF", reasoning: "#CC88FF", tool: "#66BBFF", approval: "#FFCC44",
      diff: { add: "#44FF88", del: "#FF4466" },
    }),
  },

  "solarized-dark": {
    name: "solarized-dark",
    mode: "dark",
    colors: colorsFromSemantic({
      surface: { base: "#002B36", raised: "#073642", overlay: "#0A3E4A", sunken: "#001F28" },
      border:  { subtle: "#586E75", default: "#657B83", strong: "#268BD2" },
      text:    { primary: "#FDF6E3", secondary: "#93A1A1", tertiary: "#657B83", inverse: "#002B36" },
      accent:  { default: "#268BD2", muted: "#2176B8", subtle: "#0D4A6E" },
      status:  { success: "#859900", warning: "#B58900", error: "#DC322F", info: "#2AA198" },
      memory: "#2AA198", reasoning: "#6C71C4", tool: "#268BD2", approval: "#B58900",
      diff: { add: "#859900", del: "#DC322F" },
    }),
  },
};

BUILTIN_THEMES["opencode-dark"] = BUILTIN_THEMES["opencode"]!;
BUILTIN_THEMES["opencode-light"] = BUILTIN_THEMES["paper"]!;

/* ── System theme detection ─────────────────────────────────── */

function detectSystemMode(): "dark" | "light" {
  const env = (process.env.KIRAKIRA_THEME_MODE ?? process.env.TERM_THEME ?? "").toLowerCase();
  if (env === "light") return "light";
  if (env === "dark") return "dark";

  const colorfgbg = process.env.COLORFGBG ?? "";
  if (colorfgbg) {
    const last = colorfgbg.split(";").at(-1);
    const n = last ? Number.parseInt(last, 10) : NaN;
    if (Number.isFinite(n) && n >= 0 && n <= 7) return "dark";
    if (Number.isFinite(n) && n >= 8) return "light";
  }
  return "dark";
}

/* ── Custom theme loading ───────────────────────────────────── */

function fillSemanticDefaults(colors: Partial<ThemeColors>, isDark: boolean): ThemeColors {
  const fallback = isDark
    ? BUILTIN_THEMES["kirakira"]!.colors
    : BUILTIN_THEMES["paper"]!.colors;
  return {
    bg:             colors.bg             ?? fallback.bg,
    fg:             colors.fg             ?? fallback.fg,
    muted:          colors.muted          ?? fallback.muted,
    border:         colors.border         ?? fallback.border,
    brand:          colors.brand          ?? fallback.brand,
    primary:        colors.primary        ?? fallback.primary,
    success:        colors.success        ?? fallback.success,
    warning:        colors.warning        ?? fallback.warning,
    danger:         colors.danger         ?? fallback.danger,
    user:           colors.user           ?? fallback.user,
    agent:          colors.agent          ?? fallback.agent,
    tool:           colors.tool           ?? fallback.tool,
    system:         colors.system         ?? fallback.system,
    memory:         colors.memory         ?? fallback.memory,
    surfaceRaised:  colors.surfaceRaised  ?? fallback.surfaceRaised,
    surfaceOverlay: colors.surfaceOverlay ?? fallback.surfaceOverlay,
    surfaceSunken:  colors.surfaceSunken  ?? fallback.surfaceSunken,
    borderDefault:  colors.borderDefault  ?? fallback.borderDefault,
    borderStrong:   colors.borderStrong   ?? fallback.borderStrong,
    textSecondary:  colors.textSecondary  ?? fallback.textSecondary,
    textTertiary:   colors.textTertiary   ?? fallback.textTertiary,
    textInverse:    colors.textInverse    ?? fallback.textInverse,
    accentMuted:    colors.accentMuted    ?? fallback.accentMuted,
    accentSubtle:   colors.accentSubtle   ?? fallback.accentSubtle,
    info:           colors.info           ?? fallback.info,
    reasoning:      colors.reasoning      ?? fallback.reasoning,
    approval:       colors.approval       ?? fallback.approval,
    diffAdd:        colors.diffAdd        ?? fallback.diffAdd,
    diffDel:        colors.diffDel        ?? fallback.diffDel,
  };
}

function parseThemeJson(path: string): TuiTheme | null {
  try {
    const text = readFileSync(path, "utf8");
    const obj = parseJsonc(text) as Record<string, unknown>;
    if (!obj || typeof obj !== "object") return null;
    const colors = obj.colors as Record<string, unknown> | undefined;
    if (!colors) return null;
    const isDark = obj.type !== "light";

    const partial: Partial<ThemeColors> = {};
    for (const key of Object.keys(colors)) {
      if (typeof colors[key] === "string") {
        (partial as Record<string, string>)[key] = colors[key] as string;
      }
    }

    return {
      name: typeof obj.name === "string" ? obj.name : "custom",
      mode: isDark ? "dark" : "light",
      colors: fillSemanticDefaults(partial, isDark),
    };
  } catch {
    return null;
  }
}

function tryLoadCustomTheme(name: string, workspaceRoot: string): TuiTheme | null {
  const home = homedir();
  const candidates = [
    join(home, ".config", "kirakira", "themes", `${name}.json`),
    join(workspaceRoot, ".kirakira", "themes", `${name}.json`),
    join(process.cwd(), ".kirakira", "themes", `${name}.json`),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const t = parseThemeJson(path);
    if (t) return t;
  }
  return null;
}

/* ── Public API ─────────────────────────────────────────────── */

export function listThemeNames(workspaceRoot: string): string[] {
  const names = new Set<string>(["system", ...Object.keys(BUILTIN_THEMES)]);
  const dirs = [
    join(homedir(), ".config", "kirakira", "themes"),
    join(workspaceRoot, ".kirakira", "themes"),
    join(process.cwd(), ".kirakira", "themes"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir);
      for (const ent of entries) {
        if (!ent.endsWith(".json")) continue;
        names.add(ent.replace(/\.json$/, ""));
      }
    } catch {
      // no-op
    }
  }

  return Array.from(names);
}

export function resolveTheme(themeName: string, workspaceRoot: string): TuiTheme {
  if (themeName === "system") {
    const mode = detectSystemMode();
    return mode === "light" ? BUILTIN_THEMES["paper"]! : BUILTIN_THEMES["kirakira"]!;
  }

  const custom = tryLoadCustomTheme(themeName, workspaceRoot);
  if (custom) return custom;

  return BUILTIN_THEMES[themeName] ?? BUILTIN_THEMES["kirakira"]!;
}

export function modeColor(theme: TuiTheme, mode: TuiMode): string {
  if (mode === "agent") return theme.colors.success;
  if (mode === "ask") return theme.colors.info;
  if (mode === "plan") return theme.colors.warning;
  return theme.colors.danger;
}
