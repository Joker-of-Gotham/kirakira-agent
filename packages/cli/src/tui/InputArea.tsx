import React from "react";
import { Box, Text } from "ink";
import wrapAnsi from "wrap-ansi";
import type { TuiMode } from "./types.js";
import { MODE_META } from "./types.js";
import type { TuiTheme } from "./theme.js";
import type { Attachment } from "../parser/mention.js";
import { Spinner } from "./motion.js";

interface InputAreaProps {
  value: string;
  cursorIndex: number;
  mode: TuiMode;
  thinking: boolean;
  focused?: boolean;
  topGapRows?: number;
  maxPromptRows?: number;
  theme: TuiTheme;
  model?: string;
  attachments?: Attachment[];
  taskCount?: number;
  tokenCount?: number;
  activeToolName?: string;
}

const OUTER_PADDING_X = 4;
const INNER_PADDING_X = 2;
const INNER_PADDING_Y = 1;
const RAIL_WIDTH = 1;
const PROMPT_PREFIX_WIDTH = 2;
const MIN_SURFACE_WIDTH = 12;

interface PromptTextRow {
  kind: "text";
  before: string;
  current: string;
  after: string;
  hasCursor: boolean;
  cursorAtEnd: boolean;
}

interface PromptPlaceholderRow {
  kind: "placeholder";
  text: string;
}

type PromptRenderRow = PromptTextRow | PromptPlaceholderRow;

export interface InputAreaLayout {
  contextRows: number;
  promptRows: PromptRenderRow[];
  totalPromptRows: number;
  hiddenPromptRows: number;
  metaRows: number;
  totalRows: number;
  innerWidth: number;
  promptWidth: number;
}

function shorten(value: string, max: number): string {
  return value.length > max ? `...${value.slice(-(max - 3))}` : value;
}

function normalizeInputValue(value: string): string {
  return value.replace(/\r/g, "");
}

function wrapPromptLine(line: string, width: number): string[] {
  if (line.length === 0) return [""];
  return wrapAnsi(line, Math.max(8, width), {
    hard: true,
    trim: false,
    wordWrap: true,
  }).split("\n");
}

function surfaceInnerWidth(cols: number): number {
  return Math.max(
    MIN_SURFACE_WIDTH,
    cols - (OUTER_PADDING_X * 2) - RAIL_WIDTH - (INNER_PADDING_X * 2),
  );
}

function promptTextWidth(cols: number): number {
  return Math.max(8, surfaceInnerWidth(cols) - PROMPT_PREFIX_WIDTH);
}

export function defaultInputAreaMaxPromptRows(termRows = process.stdout.rows ?? 24): number {
  const safeRows = Math.max(10, termRows);
  return Math.max(1, Math.min(8, Math.max(3, Math.floor(safeRows * 0.35))));
}

function buildEditablePromptRows(
  value: string,
  cursorIndex: number,
  width: number,
  focused: boolean,
): PromptRenderRow[] {
  const normalized = normalizeInputValue(value);
  if (!normalized) {
    return [{ kind: "placeholder", text: "Ask anything..." }];
  }

  const rows: PromptRenderRow[] = [];
  const cursor = clampCursor(normalized, cursorIndex);
  const rawLines = normalized.split("\n");
  let offset = 0;
  let cursorAssigned = false;

  rawLines.forEach((rawLine, lineIndex) => {
    const wrappedRows = wrapPromptLine(rawLine, width);

    wrappedRows.forEach((rowText) => {
      const rowStart = offset;
      const rowEnd = rowStart + rowText.length;
      const cursorHere = !cursorAssigned && cursor >= rowStart && cursor <= rowEnd;

      if (cursorHere) {
        const localCursor = Math.max(0, Math.min(rowText.length, cursor - rowStart));
        const current = rowText.slice(localCursor, localCursor + 1);
        rows.push({
          kind: "text",
          before: rowText.slice(0, localCursor),
          current,
          after: rowText.slice(localCursor + 1),
          hasCursor: focused,
          cursorAtEnd: current.length === 0,
        });
        cursorAssigned = true;
      } else {
        rows.push({
          kind: "text",
          before: rowText,
          current: "",
          after: "",
          hasCursor: false,
          cursorAtEnd: false,
        });
      }

      offset = rowEnd;
    });

    if (lineIndex < rawLines.length - 1) {
      if (!cursorAssigned && cursor === offset) {
        const last = rows[rows.length - 1];
        if (last && last.kind === "text") {
          last.hasCursor = focused;
          last.cursorAtEnd = true;
          cursorAssigned = true;
        }
      }
      offset += 1;
    }
  });

  if (!cursorAssigned) {
    const last = rows[rows.length - 1];
    if (last && last.kind === "text") {
      last.hasCursor = focused;
      last.cursorAtEnd = true;
    }
  }

  return rows.length > 0 ? rows : [{ kind: "placeholder", text: "Ask anything..." }];
}

function buildThinkingPromptRows(text: string, width: number): PromptRenderRow[] {
  return wrapPromptLine(text, width).map((rowText) => ({
    kind: "text",
    before: rowText,
    current: "",
    after: "",
    hasCursor: false,
    cursorAtEnd: false,
  }));
}

function visiblePromptRows(
  rows: PromptRenderRow[],
  maxPromptRows: number,
): { rows: PromptRenderRow[]; startRow: number } {
  const safeMax = Math.max(1, maxPromptRows);
  if (rows.length <= safeMax) return { rows, startRow: 0 };

  const cursorRow = Math.max(
    0,
    rows.findIndex((row) => row.kind === "text" && row.hasCursor),
  );
  const startRow = Math.max(0, Math.min(cursorRow - safeMax + 1, rows.length - safeMax));
  return {
    rows: rows.slice(startRow, startRow + safeMax),
    startRow,
  };
}

export function buildInputAreaLayout({
  value,
  cursorIndex,
  thinking,
  focused = true,
  attachments = [],
  cols = process.stdout.columns ?? 80,
  maxPromptRows = defaultInputAreaMaxPromptRows(),
  activeToolName,
}: {
  value: string;
  cursorIndex: number;
  thinking: boolean;
  focused?: boolean;
  attachments?: Attachment[];
  cols?: number;
  maxPromptRows?: number;
  activeToolName?: string;
}): InputAreaLayout {
  const innerWidth = surfaceInnerWidth(cols);
  const promptWidth = promptTextWidth(cols);
  const thinkingText = activeToolName
    ? `running ${shorten(activeToolName, 40)}`
    : "model is working";
  const rawPromptRows = thinking
    ? buildThinkingPromptRows(thinkingText, promptWidth)
    : buildEditablePromptRows(value, cursorIndex, promptWidth, focused);
  const visibleRows = visiblePromptRows(rawPromptRows, maxPromptRows);
  const contextRows = focused && attachments.length > 0 ? 1 : 0;
  const metaRows = 1;

  return {
    contextRows,
    promptRows: visibleRows.rows,
    totalPromptRows: rawPromptRows.length,
    hiddenPromptRows: visibleRows.startRow,
    metaRows,
    totalRows: contextRows + (INNER_PADDING_Y * 2) + visibleRows.rows.length + metaRows,
    innerWidth,
    promptWidth,
  };
}

export function measureInputAreaRows(options: {
  value: string;
  cursorIndex: number;
  thinking: boolean;
  focused?: boolean;
  attachments?: Attachment[];
  cols?: number;
  maxPromptRows?: number;
  activeToolName?: string;
}): number {
  return buildInputAreaLayout(options).totalRows;
}

function ContextLine({
  attachments,
  theme,
}: {
  attachments: Attachment[];
  theme: TuiTheme;
}): React.ReactElement | null {
  if (attachments.length === 0) return null;

  const rendered = attachments
    .slice(0, 4)
    .map((item) => `${item.kind}:${shorten(item.path, 28)}`)
    .join("  ");

  return (
    <Box paddingX={4} height={1} overflow="hidden" backgroundColor={theme.colors.bg} width="100%">
      <Text color={theme.colors.textTertiary}>context </Text>
      <Text color={theme.colors.textSecondary} wrap="truncate-end">{rendered}</Text>
      {attachments.length > 4 && (
        <Text color={theme.colors.textTertiary}> +{attachments.length - 4}</Text>
      )}
    </Box>
  );
}

function clampCursor(value: string, cursorIndex: number): number {
  return Math.max(0, Math.min(value.length, cursorIndex));
}

function EditableText({
  row,
  focused,
  theme,
}: {
  row: PromptRenderRow;
  focused: boolean;
  theme: TuiTheme;
}): React.ReactElement {
  if (row.kind === "placeholder") {
    return <Text color={theme.colors.textTertiary}>{row.text}</Text>;
  }

  return (
    <>
      {row.before && <Text color={theme.colors.fg}>{row.before}</Text>}
      {row.hasCursor && focused ? (
        row.current ? (
          <Text color={theme.colors.textInverse} backgroundColor={theme.colors.brand}>
            {row.current}
          </Text>
        ) : (
          <Text color={theme.colors.brand}>_</Text>
        )
      ) : row.current ? (
        <Text color={theme.colors.fg}>{row.current}</Text>
      ) : null}
      {row.after && <Text color={theme.colors.fg}>{row.after}</Text>}
    </>
  );
}

export function InputArea({
  value,
  cursorIndex,
  mode,
  thinking,
  focused = true,
  topGapRows = 0,
  maxPromptRows = defaultInputAreaMaxPromptRows(),
  theme,
  model,
  attachments = [],
  taskCount = 0,
  tokenCount,
  activeToolName,
}: InputAreaProps): React.ReactElement {
  const meta = MODE_META[mode];
  const cols = process.stdout.columns ?? 80;
  const isCompact = cols < 92;
  const promptColor = thinking ? theme.colors.warning : focused ? theme.colors.brand : theme.colors.textTertiary;
  const statusText = thinking
    ? activeToolName
      ? `tool ${shorten(activeToolName, 20)}`
      : "working"
    : value
      ? "enter send"
      : "/ commands";
  const modelLabel = model ? shorten(model, isCompact ? 18 : 24) : "model";
  const layout = buildInputAreaLayout({
    value,
    cursorIndex,
    thinking,
    focused,
    attachments,
    cols,
    maxPromptRows,
    activeToolName,
  });

  return (
    <Box flexDirection="column" flexShrink={0}>
      {Array.from({ length: Math.max(0, topGapRows) }).map((_, index) => (
        <Box
          key={`input_gap_${index}`}
          height={1}
          flexShrink={0}
          backgroundColor={theme.colors.bg}
          width="100%"
          overflow="hidden"
        >
          <Text color={theme.colors.bg}> </Text>
        </Box>
      ))}
      {focused && <ContextLine attachments={attachments} theme={theme} />}

      <Box paddingX={4} flexShrink={0} backgroundColor={theme.colors.bg} width="100%">
        <Box flexDirection="row" flexShrink={0} backgroundColor={theme.colors.surfaceRaised} width="100%">
          <Box width={1} flexShrink={0} backgroundColor={theme.colors.brand} />
          <Box width="100%" flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingX={2} paddingY={INNER_PADDING_Y}>
            {layout.promptRows.map((row, rowIndex) => (
              <Box key={`input_prompt_${rowIndex}`} height={1} overflow="hidden">
                {thinking ? (
                  rowIndex === 0 ? (
                    <>
                      <Spinner active color={activeToolName ? theme.colors.tool : theme.colors.reasoning} />
                      <Text> </Text>
                    </>
                  ) : (
                    <Text color={theme.colors.textTertiary}>  </Text>
                  )
                ) : rowIndex === 0 ? (
                  <>
                    <Text color={theme.colors.success} bold>$</Text>
                    <Text color={theme.colors.textTertiary}> </Text>
                  </>
                ) : (
                  <Text color={theme.colors.textTertiary}>  </Text>
                )}
                {thinking ? (
                  <Text color={theme.colors.textSecondary} wrap="truncate-end">
                    {row.kind === "text"
                      ? `${row.before}${row.current}${row.after}`
                      : row.text}
                  </Text>
                ) : (
                  <EditableText
                    row={row}
                    focused={focused}
                    theme={theme}
                  />
                )}
              </Box>
            ))}
            <Box height={1} overflow="hidden" justifyContent="space-between">
              <Box flexShrink={1} overflow="hidden">
                <Text color={promptColor} bold>{meta.label}</Text>
                <Text color={theme.colors.textTertiary}> / </Text>
                <Text color={theme.colors.textSecondary}>{modelLabel}</Text>
                {taskCount > 0 && (
                  <>
                    <Text color={theme.colors.textTertiary}> / </Text>
                    <Text color={theme.colors.info}>{taskCount} running</Text>
                  </>
                )}
              </Box>
              <Box marginLeft={2} flexShrink={0}>
                {!isCompact && tokenCount !== undefined && tokenCount > 0 && (
                  <>
                    <Text color={theme.colors.textTertiary}>{tokenCount} tokens</Text>
                    <Text color={theme.colors.textTertiary}>  </Text>
                  </>
                )}
                <Text color={theme.colors.textTertiary}>{statusText}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
