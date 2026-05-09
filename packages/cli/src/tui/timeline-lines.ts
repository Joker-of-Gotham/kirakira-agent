import wrapAnsi from "wrap-ansi";
import type { TimelineEntry } from "./types.js";
import { renderMarkdownToAnsi } from "./md-render.js";
import type { ToolDetailsLevel, ThinkingDisplay, DensityMode } from "./config.js";
import { DENSITY_SPACING } from "./types.js";

export interface TimelineRenderLine {
  id: string;
  text: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
}

interface LineStyle {
  color?: string;
  dim?: boolean;
  bold?: boolean;
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
}): TimelineRenderLine[] {
  const {
    entries,
    thinking,
    thinkingText,
    width,
    detailsLevel = "compact",
    thinkingMode = "summary",
    density = "default",
  } = params;

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
      pushPrefixed(lines, entry.id, entry.text, "> ", "  ", width, { bold: true, color: "#7AA2F7" });
    } else if (entry.kind === "agent") {
      pushPrefixed(lines, entry.id, renderMarkdownToAnsi(entry.text), "  ", "  ", width);
    } else if (entry.kind === "system") {
      const text = detailsLevel === "compact" ? entry.text.split("\n")[0] ?? entry.text : entry.text;
      pushPrefixed(lines, entry.id, text, "- ", "  ", width, { dim: true });
    } else if (entry.kind === "tool" || entry.kind === "tool_call") {
      const text = detailsLevel === "compact" ? entry.text.split("\n")[0] ?? entry.text : entry.text;
      pushPrefixed(lines, entry.id, text, "  tool ", "       ", width, { dim: true, color: "#9ECE6A" });
    } else if (entry.kind === "tool_result") {
      const text = detailsLevel === "compact" ? entry.text.split("\n")[0] ?? entry.text : entry.text;
      pushPrefixed(lines, entry.id, text, "  result ", "         ", width, { dim: true, color: "#9ECE6A" });
    } else if (entry.kind === "skill") {
      const text = detailsLevel === "compact" ? entry.text.split("\n")[0] ?? entry.text : entry.text;
      pushPrefixed(lines, entry.id, text, "  skill ", "        ", width, { dim: true });
    } else if (entry.kind === "approval") {
      pushPrefixed(lines, entry.id, entry.text, "  approval ", "           ", width, { color: "#E6B450" });
    } else if (entry.kind === "error") {
      pushPrefixed(lines, entry.id, entry.text, "x ", "  ", width, { color: "#F7768E" });
    } else {
      pushPrefixed(lines, entry.id, entry.text, "", "", width);
    }

    if (major) previousMajor = entry.kind;
  }

  if (thinking && thinkingMode !== "off") {
    const text = (thinkingText ?? "").trim();
    if (lines.length > 0) lines.push({ id: "thinking_gap", text: "" });
    lines.push({ id: "thinking_title", text: "thinking...", color: "#E6B450", dim: true });

    if (text) {
      const textLines = text.split("\n");
      if (thinkingMode === "summary") {
        const summary = textLines.map((line) => line.trim()).filter(Boolean).at(-1);
        if (summary) {
          pushPrefixed(lines, "thinking_summary", summary, "  ", "  ", width, { dim: true });
        }
      } else {
        for (const [index, line] of textLines.slice(-6).entries()) {
          pushPrefixed(lines, `thinking_${index}`, line, "  ", "  ", width, { dim: true });
        }
      }
    }
  }

  return collapseExtraBlankLines(lines);
}
