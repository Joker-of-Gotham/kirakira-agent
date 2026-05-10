import React from "react";
import { Box, Text } from "ink";
import wrapAnsi from "wrap-ansi";
import type { FocusArea } from "./key-handler.js";
import type { TimelineRenderLine } from "./timeline-lines.js";
import type { TuiTheme } from "./theme.js";
import type { ActiveToolRun } from "./types.js";
import type { ThinkingDisplay } from "./config.js";
import { AnimatedDots, Spinner, StatusPill } from "./motion.js";
import { useTicker } from "./hooks/useTicker.js";
import { MarkdownText, estimateMarkdownRows } from "./md-render.js";

interface SessionResumeItem {
  id: string;
  title: string;
  updatedAt: string;
  status?: string;
  taskCount?: number;
}

interface TimelineProps {
  lines: TimelineRenderLine[];
  hasContent: boolean;
  scrollOffset: number;
  visibleCount: number;
  focusArea: FocusArea;
  theme: TuiTheme;
  resumeItems?: SessionResumeItem[];
  thinking?: boolean;
  thinkingText?: string;
  streamingContent?: string;
  thinkingMode?: ThinkingDisplay;
  activeTool?: ActiveToolRun | null;
  expandedToolResults?: boolean;
  contentWidth?: number;
}

type ToolKind = "shell" | "edit" | "read" | "search" | "git" | "memory" | "generic";

type ToolCardRow =
  | { type: "header"; title: string; area: string; method: string; latency?: string; tone: "success" | "danger" | "tool" }
  | { type: "target"; text: string }
  | { type: "preview"; text: string; color: string }
  | { type: "more"; hiddenCount: number };

export interface VisibleTimelineSlice {
  line: TimelineRenderLine;
  lineIndex: number;
  startRow: number;
  rowCount: number;
  totalRows: number;
}

function lastUsefulLine(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function wrapPlainRows(text: string, width: number): string[] {
  const rows: string[] = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    if (rawLine.length === 0) {
      rows.push("");
      continue;
    }
    rows.push(
      ...wrapAnsi(rawLine, Math.max(8, width), {
        hard: true,
        trim: false,
        wordWrap: true,
      }).split("\n"),
    );
  }
  return rows.length > 0 ? rows : [""];
}

function parseToolCall(text: string): { verb: "call" | "done" | "fail" | "tool"; name: string; rest: string } {
  const match = /^(call|done|fail)\s+([^\s:]+):?\s*(.*)$/iu.exec(text.trim());
  if (!match) return { verb: "tool", name: "tool", rest: text.trim() };
  return {
    verb: (match[1] as "call" | "done" | "fail") ?? "tool",
    name: match[2] ?? "tool",
    rest: match[3] ?? "",
  };
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonTail(rest: string): unknown | null {
  const start = rest.search(/[\[{]/u);
  if (start < 0) return null;
  return tryParseJson(rest.slice(start).trim());
}

function stringField(obj: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function classifyTool(name: string, value: unknown): ToolKind {
  const args = asRecord(value);
  const lower = name.toLowerCase();
  if (lower.includes("shell") || lower.includes("exec") || stringField(args, ["command", "cmd", "script"])) return "shell";
  if (lower.includes("patch") || lower.includes("edit") || lower.includes("write") || stringField(args, ["patch", "diff"])) return "edit";
  if (lower.includes("read") || lower.includes("list") || lower.includes("tree")) return "read";
  if (lower.includes("search") || lower.includes("grep") || lower.includes("rg")) return "search";
  if (lower.includes("git")) return "git";
  if (lower.includes("memory")) return "memory";
  return "generic";
}

function toolAccent(kind: ToolKind, parsedVerb: string, theme: TuiTheme): string {
  if (parsedVerb === "fail") return theme.colors.danger;
  if (kind === "shell") return theme.colors.warning;
  if (kind === "edit") return theme.colors.approval;
  if (kind === "read") return theme.colors.info;
  if (kind === "search") return theme.colors.memory;
  if (kind === "git") return theme.colors.reasoning;
  return theme.colors.tool;
}

function toolLabel(kind: ToolKind): string {
  if (kind === "shell") return "Shell";
  if (kind === "edit") return "Edit";
  if (kind === "read") return "Read";
  if (kind === "search") return "Search";
  if (kind === "git") return "Git";
  if (kind === "memory") return "Memory";
  return "Tool";
}

function stripLatency(rest: string): { latency?: string; body: string } {
  const match = /^(\d+ms)\s*(.*)$/iu.exec(rest.trim());
  if (!match) return { body: rest.trim() };
  return { latency: match[1], body: match[2] ?? "" };
}

function decodeEscapedText(text: string): string {
  let out = text.trim();
  for (let i = 0; i < 2; i += 1) {
    const parsed = tryParseJson(out);
    if (typeof parsed !== "string") break;
    out = parsed.trim();
  }
  return out
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "  ")
    .replace(/\\"/g, "\"");
}

function previewLinesFromText(text: string, maxLines = 3): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, maxLines);
}

function compactJson(value: unknown): string {
  if (typeof value === "string") return decodeEscapedText(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeStructuredValue(value: unknown, maxLines: number): string[] {
  if (typeof value === "string") {
    const decoded = decodeEscapedText(value);
    const parsed = tryParseJson(decoded);
    if (parsed !== null) return summarizeStructuredValue(parsed, maxLines);
    return previewLinesFromText(decoded, maxLines);
  }

  if (Array.isArray(value)) {
    return value.slice(0, maxLines).map((item) => {
      const record = asRecord(item);
      if (record) {
        const name = stringField(record, ["name", "path", "file", "title", "id"]);
        const type = stringField(record, ["type", "kind", "mode"]);
        const size = stringField(record, ["size", "length"]);
        if (name || type) {
          return [name, type, size].filter(Boolean).join("  ");
        }
      }
      return compactJson(item);
    });
  }

  const record = asRecord(value);
  if (!record) return [];

  const contentText = extractContentText(record);
  if (contentText) {
    const parsed = tryParseJson(contentText);
    if (parsed !== null) return summarizeStructuredValue(parsed, maxLines);
    return previewLinesFromText(contentText, maxLines);
  }

  const fields = ["path", "file", "target", "url", "command", "query", "pattern", "status", "error"]
    .map((key) => {
      const raw = record[key];
      return typeof raw === "string" && raw.trim() ? `${key}: ${decodeEscapedText(raw)}` : "";
    })
    .filter(Boolean);
  if (fields.length > 0) return fields.slice(0, maxLines);

  try {
    return previewLinesFromText(JSON.stringify(value, null, 2), maxLines);
  } catch {
    return [String(value)];
  }
}

function extractContentText(value: unknown): string | undefined {
  if (typeof value === "string") return decodeEscapedText(value);
  if (Array.isArray(value)) {
    const chunks = value
      .map((item) => extractContentText(item))
      .filter((item): item is string => Boolean(item));
    return chunks.length > 0 ? chunks.join("\n") : undefined;
  }

  const record = asRecord(value);
  if (!record) return undefined;

  for (const key of ["text", "output", "stdout", "stderr", "result", "content"]) {
    const raw = record[key];
    const extracted = extractContentText(raw);
    if (extracted) return extracted;
  }

  const structuredText = extractContentText(record.structuredContent);
  if (structuredText) return structuredText;
  return undefined;
}

function splitToolName(name: string): { area: string; method: string } {
  const cleaned = name.replace(/^mcp[:._-]*/iu, "");
  const parts = cleaned.split(/__|[:.]/u).filter(Boolean);
  if (parts.length >= 2) {
    return { area: parts[0] ?? "mcp", method: parts.slice(1).join(".") };
  }
  return { area: "mcp", method: cleaned || name };
}

function compactToolArgsPreview(text: string): string {
  const parsed = tryParseJson(text);
  const lines = parsed !== null
    ? summarizeStructuredValue(parsed, 1)
    : previewLinesFromText(decodeEscapedText(text), 1);
  return lines[0] ?? "";
}

function previewColorForLine(line: string, theme: TuiTheme): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("+")) return theme.colors.success;
  if (trimmed.startsWith("-")) return theme.colors.danger;
  if (trimmed.startsWith("@@")) return theme.colors.info;
  return theme.colors.textSecondary;
}

function buildToolCardRows(line: TimelineRenderLine, expanded: boolean, theme: TuiTheme): ToolCardRow[] {
  const parsed = parseToolCall(line.text);
  const { latency, body } = stripLatency(parsed.rest);
  const parsedValue = parseJsonTail(body || parsed.rest);
  const record = asRecord(parsedValue);
  const kind = classifyTool(parsed.name, parsedValue);
  const toolName = splitToolName(parsed.name);
  const command = stringField(record, ["command", "cmd", "script"]);
  const patch = stringField(record, ["patch", "diff"]);
  const path = stringField(record, ["path", "file", "filePath", "file_path", "target", "relativePath", "directory", "cwd", "url"]);
  const title = parsed.verb === "done"
    ? `${toolLabel(kind)} completed`
    : parsed.verb === "fail"
      ? `${toolLabel(kind)} failed`
      : `${toolLabel(kind)} call`;
  const tone: "success" | "danger" | "tool" = parsed.verb === "done"
    ? "success"
    : parsed.verb === "fail"
      ? "danger"
      : "tool";
  const previewLimit = expanded ? 18 : 4;
  const fullPreview = command && parsed.verb === "call"
    ? [`$ ${decodeEscapedText(command)}`]
    : patch
      ? previewLinesFromText(decodeEscapedText(patch), previewLimit + 8)
      : parsedValue !== null
        ? summarizeStructuredValue(parsedValue, previewLimit + 8)
        : body
          ? previewLinesFromText(decodeEscapedText(body), previewLimit + 8)
          : parsed.rest
            ? previewLinesFromText(decodeEscapedText(parsed.rest), previewLimit + 8)
            : [];
  const preview = fullPreview.slice(0, previewLimit);
  const rows: ToolCardRow[] = [{
    type: "header",
    title,
    area: toolName.area,
    method: toolName.method,
    latency,
    tone,
  }];

  const target = path ?? (command && parsed.verb !== "call" ? command : undefined);
  if (target) rows.push({ type: "target", text: decodeEscapedText(target) });
  for (const item of preview) {
    rows.push({ type: "preview", text: item, color: previewColorForLine(item, theme) });
  }
  if (fullPreview.length > preview.length) {
    rows.push({ type: "more", hiddenCount: fullPreview.length - preview.length });
  }
  return rows;
}

function buildLineRows(line: TimelineRenderLine, width: number, expandedToolResults: boolean, theme: TuiTheme): number {
  const innerWidth = Math.max(12, width - 6);

  if (line.text === "") return 1;
  if (line.lane === "meta") return wrapPlainRows(line.text, width).length;
  if (line.lane === "user") return wrapPlainRows(line.text, innerWidth).length;
  if (line.lane === "agent") return estimateMarkdownRows(line.text, innerWidth);
  if (line.lane === "error") return wrapPlainRows(line.text, innerWidth).length;
  if (line.lane === "thinking") return 1;
  if (line.lane === "tool") return buildToolCardRows(line, expandedToolResults, theme).length;
  return wrapPlainRows(line.text, width).length;
}

export function estimateTimelineLineRows(
  line: TimelineRenderLine,
  width: number,
  expandedToolResults: boolean,
  theme: TuiTheme,
): number {
  return buildLineRows(line, width, expandedToolResults, theme);
}

export function measureTimelineRows(
  lines: TimelineRenderLine[],
  width: number,
  expandedToolResults: boolean,
  theme: TuiTheme,
): number {
  return lines.reduce(
    (sum, line) => sum + estimateTimelineLineRows(line, width, expandedToolResults, theme),
    0,
  );
}

export function selectVisibleTimelineLines(
  lines: TimelineRenderLine[],
  visibleCount: number,
  scrollOffset: number,
  width: number,
  expandedToolResults: boolean,
  theme: TuiTheme,
): {
  visible: VisibleTimelineSlice[];
  startIdx: number;
  hasAboveIndicator: boolean;
  hasBelowIndicator: boolean;
  hiddenAboveRows: number;
  hiddenBelowRows: number;
  totalRows: number;
} {
  const rowCounts = lines.map((line) => estimateTimelineLineRows(line, width, expandedToolResults, theme));
  const totalRows = rowCounts.reduce((sum, count) => sum + count, 0);

  if (totalRows === 0) {
    return {
      visible: [],
      startIdx: 0,
      hasAboveIndicator: false,
      hasBelowIndicator: false,
      hiddenAboveRows: 0,
      hiddenBelowRows: 0,
      totalRows: 0,
    };
  }

  const safeVisibleCount = Math.max(1, visibleCount);
  const safeScrollOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, totalRows - safeVisibleCount)));
  const endRowExclusive = totalRows - safeScrollOffset;
  const startRow = Math.max(0, endRowExclusive - safeVisibleCount);
  const visible: VisibleTimelineSlice[] = [];
  let cursor = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineStart = cursor;
    const lineEnd = cursor + rowCounts[index]!;
    const overlapStart = Math.max(startRow, lineStart);
    const overlapEnd = Math.min(endRowExclusive, lineEnd);

    if (overlapStart < overlapEnd) {
      visible.push({
        line,
        lineIndex: index,
        startRow: overlapStart - lineStart,
        rowCount: overlapEnd - overlapStart,
        totalRows: rowCounts[index]!,
      });
    }

    cursor = lineEnd;
  }

  return {
    visible,
    startIdx: visible[0]?.lineIndex ?? 0,
    hasAboveIndicator: startRow > 0,
    hasBelowIndicator: safeScrollOffset > 0,
    hiddenAboveRows: startRow,
    hiddenBelowRows: safeScrollOffset,
    totalRows,
  };
}

export function allocateVisibleTimelineRows(visibleLines: VisibleTimelineSlice[]): number[] {
  return visibleLines.map((slice) => slice.rowCount);
}

function ToolCard({
  line,
  theme,
  expanded,
  startRow,
  rowCount,
}: {
  line: TimelineRenderLine;
  theme: TuiTheme;
  expanded: boolean;
  startRow: number;
  rowCount: number;
}): React.ReactElement {
  const parsed = parseToolCall(line.text);
  const parsedValue = parseJsonTail(stripLatency(parsed.rest).body || parsed.rest);
  const kind = classifyTool(parsed.name, parsedValue);
  const accent = toolAccent(kind, parsed.verb, theme);
  const rows = buildToolCardRows(line, expanded, theme).slice(startRow, startRow + rowCount);

  return (
    <Box
      width="100%"
      marginTop={startRow === 0 ? 1 : 0}
      flexShrink={0}
      flexDirection="row"
      backgroundColor={kind === "shell" ? theme.colors.surfaceSunken : theme.colors.surfaceRaised}
    >
      <Box width={1} flexShrink={0} backgroundColor={accent} />
      <Box width="100%" flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingX={2}>
        {rows.map((row, rowIndex) => {
          if (row.type === "header") {
            return (
              <Box key={`tool_header_${rowIndex}`} width="100%" height={1} overflow="hidden">
                <StatusPill label={parsed.verb === "call" ? "running" : parsed.verb} tone={row.tone} theme={theme} />
                <Text color={theme.colors.textTertiary}>  </Text>
                <Box flexShrink={1} overflow="hidden">
                  <Text color={accent} bold>{row.title}</Text>
                  <Text color={theme.colors.textTertiary}>  </Text>
                  <Text color={theme.colors.info}>{row.area}</Text>
                  <Text color={theme.colors.textTertiary}> / </Text>
                  <Text color={theme.colors.textSecondary} wrap="truncate-end">
                    {shorten(row.method, 58)}
                  </Text>
                </Box>
                {row.latency && <Text color={theme.colors.textTertiary}>  {row.latency}</Text>}
              </Box>
            );
          }

          if (row.type === "target") {
            return (
              <Box key={`tool_target_${rowIndex}`} height={1} overflow="hidden">
                <Text color={theme.colors.textTertiary}>target  </Text>
                <Text color={theme.colors.success} wrap="truncate-end">{shorten(row.text, 128)}</Text>
              </Box>
            );
          }

          if (row.type === "more") {
            return (
              <Text key={`tool_more_${rowIndex}`} color={theme.colors.textTertiary} dimColor>
                ... +{row.hiddenCount} lines (ctrl+r expand)
              </Text>
            );
          }

          return (
            <Box
              key={`tool_preview_${rowIndex}`}
              height={1}
              overflow="hidden"
              paddingX={1}
              backgroundColor={theme.colors.surfaceOverlay}
            >
              <Text color={row.color} wrap="truncate-end">{shorten(row.text, 160)}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function MessageCard({
  accent,
  background,
  showTopGap,
  children,
}: {
  accent: string;
  background: string;
  showTopGap: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      width="100%"
      marginTop={showTopGap ? 1 : 0}
      flexShrink={0}
      flexDirection="row"
      backgroundColor={background}
    >
      <Box width={1} flexShrink={0} backgroundColor={accent} />
      <Box width="100%" flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingX={2}>
        {children}
      </Box>
    </Box>
  );
}

function ActivityPanel({
  thinking,
  thinkingText,
  streamingContent,
  thinkingMode,
  activeTool,
  theme,
}: {
  thinking: boolean;
  thinkingText: string;
  streamingContent: string;
  thinkingMode: ThinkingDisplay;
  activeTool: ActiveToolRun | null;
  theme: TuiTheme;
}): React.ReactElement | null {
  const hasActivity = thinking || activeTool !== null;
  const tick = useTicker(hasActivity, 250);
  if (!hasActivity) return null;

  const hasStreamingContent = streamingContent.trim().length > 0;
  const toolRunning = activeTool?.status === "running";
  const color = activeTool
    ? activeTool.status === "failed"
      ? theme.colors.danger
      : theme.colors.tool
    : hasStreamingContent
      ? theme.colors.agent
      : theme.colors.reasoning;
  const label = activeTool
    ? activeTool.status === "running"
      ? "tool call"
      : activeTool.status === "failed"
        ? "tool failed"
        : "tool done"
    : hasStreamingContent
      ? "streaming"
      : "thinking";
  const elapsedMs = activeTool ? Math.max(0, Date.now() - activeTool.startedAt) : tick;
  const preview = activeTool
    ? `${activeTool.name} ${compactToolArgsPreview(activeTool.argsPreview)}`
    : hasStreamingContent
      ? lastUsefulLine(streamingContent)
      : thinkingMode === "off"
        ? "Model is working"
        : lastUsefulLine(thinkingText) || "Model is working";
  const tone = activeTool?.status === "failed" ? "danger" : activeTool ? "tool" : hasStreamingContent ? "info" : "reasoning";

  return (
    <Box width="100%" marginTop={1} flexShrink={0} flexDirection="row" backgroundColor={theme.colors.surfaceRaised}>
      <Box width={1} flexShrink={0} backgroundColor={color} />
      <Box width="100%" flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingX={2}>
        <Box height={1} overflow="hidden">
          <Spinner active={thinking || toolRunning} color={color} />
          <Text color={color} bold> {label}</Text>
          <AnimatedDots active={thinking || toolRunning} color={theme.colors.textTertiary} />
          <Text color={theme.colors.textTertiary}>  </Text>
          <StatusPill label={activeTool?.status ?? "active"} tone={tone} theme={theme} />
        </Box>
        <Box height={1} overflow="hidden">
          <Text color={theme.colors.textSecondary} wrap="truncate-end">
            {shorten(preview, 120)}
          </Text>
          {activeTool && (
            <Text color={theme.colors.textTertiary} dimColor>
              {"  "}
              {activeTool.latencyMs !== undefined
                ? `${activeTool.latencyMs}ms`
                : `${Math.floor(elapsedMs / 1000)}s`}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function TimelineLine({
  slice,
  theme,
  expandedToolResults,
  contentWidth,
}: {
  slice: VisibleTimelineSlice;
  theme: TuiTheme;
  expandedToolResults: boolean;
  contentWidth: number;
}): React.ReactElement {
  const { line, startRow, rowCount } = slice;
  if (line.text === "") return <Box height={rowCount} flexShrink={0} />;

  if (line.lane === "user") {
    const rows = wrapPlainRows(line.text, contentWidth).slice(startRow, startRow + rowCount);
    return (
      <MessageCard accent={line.accentColor ?? theme.colors.brand} background={theme.colors.surfaceRaised} showTopGap={startRow === 0}>
        {rows.map((row, rowIndex) => (
          <Text key={`user_${rowIndex}`} color={line.color ?? theme.colors.fg} bold wrap="truncate-end">
            {row || " "}
          </Text>
        ))}
      </MessageCard>
    );
  }

  if (line.lane === "thinking") {
    const summary = line.text === "thinking..." ? "" : line.text;
    const thinkingLine = summary ? `Thinking  ${summary}` : "Thinking";
    return (
      <MessageCard accent={line.accentColor ?? theme.colors.reasoning} background={theme.colors.accentSubtle} showTopGap={startRow === 0}>
        <Text color={theme.colors.reasoning} italic bold wrap="truncate-end">
          {thinkingLine}
        </Text>
      </MessageCard>
    );
  }

  if (line.lane === "tool") {
    return (
      <ToolCard
        line={line}
        theme={theme}
        expanded={expandedToolResults}
        startRow={startRow}
        rowCount={rowCount}
      />
    );
  }

  if (line.lane === "error") {
    const rows = wrapPlainRows(line.text, contentWidth).slice(startRow, startRow + rowCount);
    return (
      <MessageCard accent={theme.colors.danger} background={theme.colors.surfaceRaised} showTopGap={startRow === 0}>
        {rows.map((row, rowIndex) => (
          <Text key={`error_${rowIndex}`} color={theme.colors.danger} bold wrap="truncate-end">
            {row || " "}
          </Text>
        ))}
      </MessageCard>
    );
  }

  if (line.lane === "meta") {
    const rows = wrapPlainRows(line.text, Math.max(12, contentWidth + 4)).slice(startRow, startRow + rowCount);
    return (
      <Box width="100%" flexShrink={0} paddingX={1}>
        <Box flexDirection="column">
          {rows.map((row, rowIndex) => (
            <Text key={`meta_${rowIndex}`} color={line.color ?? theme.colors.textTertiary} dimColor wrap="truncate-end">
              {row || " "}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (line.lane === "agent") {
    return (
      <MessageCard accent={theme.colors.agent} background={theme.colors.surfaceSunken} showTopGap={startRow === 0}>
        <MarkdownText text={line.text} theme={theme} width={contentWidth} startRow={startRow} rowCount={rowCount} />
      </MessageCard>
    );
  }

  const rows = wrapPlainRows(line.text, Math.max(12, contentWidth + 4)).slice(startRow, startRow + rowCount);
  return (
    <Box width="100%" flexShrink={0} paddingX={1}>
      <Box flexDirection="column">
        {rows.map((row, rowIndex) => (
          <Text key={`plain_${rowIndex}`} color={line.color} dimColor={line.dim} bold={line.bold} wrap="truncate-end">
            {row || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

export function Timeline({
  lines,
  hasContent,
  scrollOffset,
  visibleCount,
  theme,
  resumeItems = [],
  thinking = false,
  thinkingText = "",
  streamingContent = "",
  thinkingMode = "summary",
  activeTool = null,
  expandedToolResults = false,
  contentWidth,
}: TimelineProps): React.ReactElement {
  const hasActivity = thinking || activeTool !== null;
  const activityRows = hasActivity ? 4 : 0;
  const effectiveVisibleCount = Math.max(1, visibleCount - activityRows);
  const renderWidth = Math.max(20, contentWidth ?? (process.stdout.columns ?? 80) - 12);
  const { visible } = selectVisibleTimelineLines(
    lines,
    effectiveVisibleCount,
    scrollOffset,
    renderWidth,
    expandedToolResults,
    theme,
  );

  if (!hasContent) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={4} paddingY={2} justifyContent="center">
        <Box justifyContent="center">
          <Text color={theme.colors.textTertiary} bold>kira</Text>
          <Text color={theme.colors.brand} bold>kira</Text>
        </Box>
        {resumeItems.slice(0, 3).map((item) => (
          <Text key={item.id} color={theme.colors.textTertiary}>
            {item.status === "running" ? "*" : "-"} {item.title}  {item.updatedAt}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingX={3} paddingY={0} backgroundColor={theme.colors.bg}>
      {visible.map((slice) => (
        <TimelineLine
          key={`${slice.line.id}_${slice.startRow}_${slice.rowCount}`}
          slice={slice}
          theme={theme}
          expandedToolResults={expandedToolResults}
          contentWidth={Math.max(12, renderWidth - 4)}
        />
      ))}

      <Box flexGrow={1} />

      <ActivityPanel
        thinking={thinking}
        thinkingText={thinkingText}
        streamingContent={streamingContent}
        thinkingMode={thinkingMode}
        activeTool={activeTool}
        theme={theme}
      />
    </Box>
  );
}
