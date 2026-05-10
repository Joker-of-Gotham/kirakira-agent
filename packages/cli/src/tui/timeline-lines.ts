import wrapAnsi from "wrap-ansi";
import type { TimelineEntry } from "./types.js";
import type { ToolDetailsLevel, ThinkingDisplay, DensityMode } from "./config.js";
import { DENSITY_SPACING } from "./types.js";
import type { TuiTheme } from "./theme.js";

export interface TimelineRenderLine {
  id: string;
  text: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
  lane?: "user" | "agent" | "meta" | "tool" | "thinking" | "error";
  kind?: TimelineEntry["kind"];
  accentColor?: string;
  backgroundColor?: string;
}

interface LineStyle {
  color?: string;
  dim?: boolean;
  bold?: boolean;
  lane?: "user" | "agent" | "meta" | "tool" | "thinking" | "error";
  kind?: TimelineEntry["kind"];
  accentColor?: string;
  backgroundColor?: string;
}

function wrapLine(text: string, width: number): string[] {
  if (!text) return [""];
  return wrapAnsi(text, Math.max(8, width), {
    hard: true,
    trim: false,
    wordWrap: true,
  }).split("\n");
}

function pushPrefixed(
  out: TimelineRenderLine[],
  idBase: string,
  text: string,
  firstPrefix: string,
  contPrefix: string,
  width: number,
  style: LineStyle = {},
): void {
  const rawLines = text.split("\n");
  let seq = 0;

  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i] ?? "";
    const isFirstRaw = i === 0;
    const chunks = wrapLine(raw, width - (isFirstRaw ? firstPrefix.length : contPrefix.length));

    for (let j = 0; j < chunks.length; j += 1) {
      const lead = isFirstRaw && j === 0 ? firstPrefix : contPrefix;
      out.push({
        id: `${idBase}_${seq++}`,
        text: `${lead}${chunks[j] ?? ""}`,
        ...style,
      });
    }
  }
}

function pushGap(lines: TimelineRenderLine[], id: string, density: DensityMode): void {
  const gap = DENSITY_SPACING[density]?.cardGap ?? 1;
  for (let i = 0; i < gap; i += 1) {
    lines.push({ id: `${id}_gap${i}`, text: "" });
  }
}

function pushCard(
  out: TimelineRenderLine[],
  id: string,
  text: string,
  style: LineStyle = {},
): void {
  out.push({
    id,
    text,
    ...style,
  });
}

function collapseExtraBlankLines(lines: TimelineRenderLine[]): TimelineRenderLine[] {
  const out: TimelineRenderLine[] = [];
  let prevBlank = false;
  for (const line of lines) {
    const blank = line.text.trim() === "";
    if (blank && prevBlank) continue;
    out.push(line);
    prevBlank = blank;
  }
  return out;
}

export function buildTimelineLines(params: {
  entries: TimelineEntry[];
  thinking: boolean;
  thinkingText?: string;
  width: number;
  detailsLevel?: ToolDetailsLevel;
  thinkingMode?: ThinkingDisplay;
  density?: DensityMode;
  theme?: TuiTheme;
}): TimelineRenderLine[] {
  const {
    entries,
    thinking,
    thinkingText,
    width,
    detailsLevel = "compact",
    thinkingMode = "summary",
    density = "default",
    theme,
  } = params;
  const colors = theme?.colors;

  const lines: TimelineRenderLine[] = [];
  let previousMajor: TimelineEntry["kind"] | null = null;

  for (const entry of entries) {
    const major = entry.kind === "user" || entry.kind === "agent" || entry.kind === "error";
    if (major && previousMajor && previousMajor !== entry.kind && lines.length > 0) {
      pushGap(lines, entry.id, density);
    }

    if (
      detailsLevel === "off" &&
      (entry.kind === "tool" ||
        entry.kind === "tool_call" ||
        entry.kind === "tool_result" ||
        entry.kind === "system" ||
        entry.kind === "skill")
    ) {
      previousMajor = major ? entry.kind : previousMajor;
      continue;
    }

    if (entry.kind === "user") {
      pushCard(lines, entry.id, entry.text, {
        bold: true,
        color: colors?.fg,
        lane: "user",
        kind: entry.kind,
        accentColor: colors?.brand ?? "#7DDC9A",
        backgroundColor: colors?.surfaceRaised,
      });
    } else if (entry.kind === "agent") {
      pushCard(lines, entry.id, entry.text, { color: colors?.fg, lane: "agent", kind: entry.kind });
    } else if (entry.kind === "thinking") {
      if (thinkingMode === "off") {
        previousMajor = major ? entry.kind : previousMajor;
        continue;
      }
      const textLines = entry.text.split("\n").map((line) => line.trim()).filter(Boolean);
      const text = thinkingMode === "summary"
        ? textLines.at(-1) ?? entry.text
        : textLines.slice(-8).join("\n");
      pushCard(lines, entry.id, text, {
        dim: true,
        color: colors?.reasoning ?? "#CBA6F7",
        lane: "thinking",
        kind: entry.kind,
        accentColor: colors?.reasoning ?? "#CBA6F7",
        backgroundColor: colors?.surfaceRaised,
      });
    } else if (entry.kind === "system") {
      const text = detailsLevel === "compact" ? entry.text.split("\n")[0] ?? entry.text : entry.text;
      pushPrefixed(lines, entry.id, text, "  - ", "    ", width, { dim: true, color: colors?.system, lane: "meta", kind: entry.kind });
    } else if (entry.kind === "tool" || entry.kind === "tool_call") {
      const text = detailsLevel === "compact" ? entry.text.split("\n")[0] ?? entry.text : entry.text;
      pushCard(lines, entry.id, text, {
        dim: true,
        color: colors?.tool ?? "#9ECE6A",
        lane: "tool",
        kind: entry.kind,
        accentColor: colors?.tool ?? "#9ECE6A",
        backgroundColor: colors?.surfaceRaised,
      });
    } else if (entry.kind === "tool_result") {
      const text = detailsLevel === "compact" ? entry.text : entry.text;
      const failed = /^fail\b/.test(text);
      pushCard(lines, entry.id, text, {
        dim: true,
        color: failed ? colors?.danger ?? "#F7768E" : colors?.success ?? "#9ECE6A",
        lane: "tool",
        kind: entry.kind,
        accentColor: failed ? colors?.danger ?? "#F7768E" : colors?.success ?? "#9ECE6A",
        backgroundColor: colors?.surfaceRaised,
      });
    } else if (entry.kind === "skill") {
      const text = detailsLevel === "compact" ? entry.text.split("\n")[0] ?? entry.text : entry.text;
      pushPrefixed(lines, entry.id, text, "  +  ", "     ", width, { dim: true, color: colors?.info, lane: "meta", kind: entry.kind });
    } else if (entry.kind === "approval") {
      pushPrefixed(lines, entry.id, entry.text, "  !  ", "     ", width, { color: colors?.approval ?? "#E6B450", lane: "meta", kind: entry.kind });
    } else if (entry.kind === "error") {
      pushCard(lines, entry.id, entry.text, { color: colors?.danger ?? "#F7768E", lane: "error", kind: entry.kind });
    } else {
      pushPrefixed(lines, entry.id, entry.text, "", "", width);
    }

    if (major) previousMajor = entry.kind;
  }

  if (thinking && thinkingMode !== "off") {
    const text = (thinkingText ?? "").trim();
    if (lines.length > 0) lines.push({ id: "thinking_gap", text: "" });
    lines.push({
      id: "thinking_title",
      text: "thinking...",
      color: colors?.reasoning ?? "#E6B450",
      dim: true,
      lane: "thinking",
      kind: "thinking",
      accentColor: colors?.reasoning ?? "#E6B450",
      backgroundColor: colors?.surfaceRaised,
    });

    if (text) {
      const textLines = text.split("\n");
      if (thinkingMode === "summary") {
        const summary = textLines.map((line) => line.trim()).filter(Boolean).at(-1);
        if (summary) {
          pushPrefixed(lines, "thinking_summary", summary, "", "", width, {
            dim: true,
            lane: "thinking",
            kind: "thinking",
            color: colors?.textSecondary,
            accentColor: colors?.reasoning,
            backgroundColor: colors?.surfaceRaised,
          });
        }
      } else {
        for (const [index, line] of textLines.slice(-6).entries()) {
          pushPrefixed(lines, `thinking_${index}`, line, "", "", width, {
            dim: true,
            lane: "thinking",
            kind: "thinking",
            color: colors?.textSecondary,
            accentColor: colors?.reasoning,
            backgroundColor: colors?.surfaceRaised,
          });
        }
      }
    }
  }

  return collapseExtraBlankLines(lines);
}
