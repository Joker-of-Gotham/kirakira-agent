import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";

export type DiffStyle = "auto" | "stacked";
export type ToolDetailsLevel = "off" | "compact" | "full";
export type ThinkingDisplay = "off" | "summary" | "model";
export type DensityMode = "spacious" | "default" | "compact" | "dense";

export interface TuiConfig {
  theme: string;
  mouse: boolean;
  diffStyle: DiffStyle;
  density: DensityMode;
  scrollSpeed: number;
  scrollAcceleration: { enabled: boolean };
  statusline: string[];
  sidebar: {
    defaultOpen: boolean;
    width: number;
    sections: string[];
  };
  timeline: {
    toolDetails: ToolDetailsLevel;
    showReasoning: ThinkingDisplay;
    showPolicyBadges: boolean;
    compactCards: boolean;
  };
  keybinds: {
    leader: string;
    sessionNew: string;
    sessionList: string;
    sessionCompact: string;
    detailsToggle: string;
    themeList: string;
    modelList: string;
    subagentList: string;
    traceView: string;
  };
}

export interface LoadTuiConfigOptions {
  workspaceRoot: string;
  explicitPath?: string;
  themeOverride?: string;
  noMouse?: boolean;
}

export interface LoadedTuiConfig {
  config: TuiConfig;
  sources: string[];
  warnings: string[];
}

export const DEFAULT_TUI_CONFIG: TuiConfig = {
  theme: "graphite",
  mouse: true,
  diffStyle: "auto",
  density: "default",
  scrollSpeed: 3,
  scrollAcceleration: { enabled: true },
  statusline: [
    "workspace",
    "branch",
    "mode",
    "model",
    "context",
    "cost",
    "tasks",
    "mcp",
    "memory",
    "trace",
  ],
  sidebar: {
    defaultOpen: false,
    width: 28,
    sections: ["sessions", "tasks", "resources", "memory"],
  },
  timeline: {
    toolDetails: "compact",
    showReasoning: "summary",
    showPolicyBadges: true,
    compactCards: false,
  },
  keybinds: {
    leader: "ctrl+x",
    sessionNew: "<leader>n",
    sessionList: "<leader>l",
    sessionCompact: "<leader>c",
    detailsToggle: "<leader>d",
    themeList: "<leader>t",
    modelList: "<leader>m",
    subagentList: "<leader>a",
    traceView: "<leader>o",
  },
};

interface RawTuiConfig {
  theme?: unknown;
  mouse?: unknown;
  diff_style?: unknown;
  density?: unknown;
  scroll_speed?: unknown;
  scroll_acceleration?: { enabled?: unknown } | unknown;
  statusline?: unknown;
  sidebar?: {
    default_open?: unknown;
    width?: unknown;
    sections?: unknown;
  } | unknown;
  timeline?: {
    tool_details?: unknown;
    show_reasoning?: unknown;
    show_policy_badges?: unknown;
    compact_cards?: unknown;
  } | unknown;
  keybinds?: {
    leader?: unknown;
    session_new?: unknown;
    session_list?: unknown;
    session_compact?: unknown;
    details_toggle?: unknown;
    theme_list?: unknown;
    model_list?: unknown;
    subagent_list?: unknown;
    trace_view?: unknown;
  } | unknown;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((x): x is string => typeof x === "string");
  return out.length > 0 ? out : undefined;
}

function toBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toLiteral<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function normalizeRaw(raw: RawTuiConfig): Partial<TuiConfig> {
  const out: Partial<TuiConfig> = {};

  if (typeof raw.theme === "string") out.theme = raw.theme;
  if (typeof raw.mouse === "boolean") out.mouse = raw.mouse;

  const diffStyle = toLiteral(raw.diff_style, ["auto", "stacked"] as const);
  if (diffStyle) out.diffStyle = diffStyle;

  const density = toLiteral(raw.density, ["spacious", "default", "compact", "dense"] as const);
  if (density) out.density = density;

  const scrollSpeed = toNumber(raw.scroll_speed);
  if (scrollSpeed !== undefined) out.scrollSpeed = Math.max(1, Math.floor(scrollSpeed));

  if (raw.scroll_acceleration && typeof raw.scroll_acceleration === "object") {
    const acc = raw.scroll_acceleration as { enabled?: unknown };
    const enabled = toBool(acc.enabled);
    if (enabled !== undefined) out.scrollAcceleration = { enabled };
  }

  const statusline = toStringArray(raw.statusline);
  if (statusline) out.statusline = statusline;

  if (raw.sidebar && typeof raw.sidebar === "object") {
    const src = raw.sidebar as {
      default_open?: unknown;
      width?: unknown;
      sections?: unknown;
    };
    const sidebar: Partial<TuiConfig["sidebar"]> = {};
    const open = toBool(src.default_open);
    if (open !== undefined) sidebar.defaultOpen = open;
    const width = toNumber(src.width);
    if (width !== undefined) sidebar.width = Math.max(24, Math.floor(width));
    const sections = toStringArray(src.sections);
    if (sections) sidebar.sections = sections;
    if (Object.keys(sidebar).length > 0) {
      out.sidebar = sidebar as TuiConfig["sidebar"];
    }
  }

  if (raw.timeline && typeof raw.timeline === "object") {
    const src = raw.timeline as {
      tool_details?: unknown;
      show_reasoning?: unknown;
      show_policy_badges?: unknown;
      compact_cards?: unknown;
    };
    const timeline: Partial<TuiConfig["timeline"]> = {};
    const details = toLiteral(src.tool_details, ["off", "compact", "full"] as const);
    if (details) timeline.toolDetails = details;
    const showReasoning = toLiteral(src.show_reasoning, ["off", "summary", "model"] as const);
    if (showReasoning) timeline.showReasoning = showReasoning;
    const policy = toBool(src.show_policy_badges);
    if (policy !== undefined) timeline.showPolicyBadges = policy;
    const compact = toBool(src.compact_cards);
    if (compact !== undefined) timeline.compactCards = compact;
    if (Object.keys(timeline).length > 0) {
      out.timeline = timeline as TuiConfig["timeline"];
    }
  }

  if (raw.keybinds && typeof raw.keybinds === "object") {
    const src = raw.keybinds as {
      leader?: unknown;
      session_new?: unknown;
      session_list?: unknown;
      session_compact?: unknown;
      details_toggle?: unknown;
      theme_list?: unknown;
      model_list?: unknown;
      subagent_list?: unknown;
      trace_view?: unknown;
    };
    const kb: Partial<TuiConfig["keybinds"]> = {};
    if (typeof src.leader === "string") kb.leader = src.leader;
    if (typeof src.session_new === "string") kb.sessionNew = src.session_new;
    if (typeof src.session_list === "string") kb.sessionList = src.session_list;
    if (typeof src.session_compact === "string") kb.sessionCompact = src.session_compact;
    if (typeof src.details_toggle === "string") kb.detailsToggle = src.details_toggle;
    if (typeof src.theme_list === "string") kb.themeList = src.theme_list;
    if (typeof src.model_list === "string") kb.modelList = src.model_list;
    if (typeof src.subagent_list === "string") kb.subagentList = src.subagent_list;
    if (typeof src.trace_view === "string") kb.traceView = src.trace_view;
    if (Object.keys(kb).length > 0) {
      out.keybinds = kb as TuiConfig["keybinds"];
    }
  }

  return out;
}

function mergeConfig(base: TuiConfig, patch: Partial<TuiConfig>): TuiConfig {
  return {
    ...base,
    ...patch,
    scrollAcceleration: {
      ...base.scrollAcceleration,
      ...(patch.scrollAcceleration ?? {}),
    },
    sidebar: {
      ...base.sidebar,
      ...(patch.sidebar ?? {}),
    },
    timeline: {
      ...base.timeline,
      ...(patch.timeline ?? {}),
    },
    keybinds: {
      ...base.keybinds,
      ...(patch.keybinds ?? {}),
    },
  };
}

function parseFile(path: string): { patch: Partial<TuiConfig> | null; warning?: string } {
  try {
    const rawText = readFileSync(path, "utf8");
    const errors: { error: number; offset: number; length: number }[] = [];
    const raw = parseJsonc(rawText, errors, { allowTrailingComma: true }) as RawTuiConfig | undefined;

    if (!raw || typeof raw !== "object") {
      return { patch: null };
    }
    if (errors.length > 0) {
      const msg = errors
        .map((e) => `${printParseErrorCode(e.error)}@${e.offset}`)
        .join(", ");
      return { patch: null, warning: `Invalid tui config ${path}: ${msg}` };
    }

    return { patch: normalizeRaw(raw) };
  } catch (error) {
    return {
      patch: null,
      warning: `Failed to parse tui config ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function existing(paths: string[]): string[] {
  return paths.filter((p) => existsSync(p));
}

export function loadTuiConfig(opts: LoadTuiConfigOptions): LoadedTuiConfig {
  const warnings: string[] = [];
  const home = homedir();
  const project = opts.workspaceRoot;
  const envPath = process.env.KIRAKIRA_TUI_CONFIG?.trim();

  const globalPaths = existing([
    join(home, ".config", "kirakira", "tui.json"),
    join(home, ".config", "kirakira", "tui.jsonc"),
  ]);
  const projectPaths = existing([
    join(project, "tui.json"),
    join(project, "tui.jsonc"),
    join(project, ".kirakira", "tui.json"),
    join(project, ".kirakira", "tui.jsonc"),
  ]);
  const customPaths = existing([
    ...(envPath ? [envPath] : []),
    ...(opts.explicitPath ? [opts.explicitPath] : []),
  ]);

  const sources: string[] = [];
  let config = { ...DEFAULT_TUI_CONFIG };
  const ordered = [...globalPaths, ...projectPaths, ...customPaths];

  for (const path of ordered) {
    const parsed = parseFile(path);
    if (parsed.warning) warnings.push(parsed.warning);
    if (parsed.patch) {
      config = mergeConfig(config, parsed.patch);
      sources.push(path);
    }
  }

  if (opts.themeOverride) {
    config.theme = opts.themeOverride;
  }
  if (opts.noMouse) {
    config.mouse = false;
  }

  return { config, sources, warnings };
}
