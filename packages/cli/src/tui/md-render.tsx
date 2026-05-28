import React, { useMemo } from "react";
import { Box, Text } from "ink";
import wrapAnsi from "wrap-ansi";
import type { TuiTheme } from "./theme.js";

type InlineKind =
  | "plain"
  | "bold"
  | "italic"
  | "code"
  | "heading"
  | "quote"
  | "bullet";

interface InlineToken {
  kind: InlineKind;
  text: string;
}

type MarkdownBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; level: 1 | 2; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "code"; language?: string; lines: string[] }
  | { type: "rule" };

export type MarkdownRenderRow =
  | { type: "inline"; tokens: InlineToken[] }
  | { type: "table"; text: string; tone: "border" | "header" | "body" }
  | { type: "code"; text: string }
  | { type: "rule"; text: string };

function visualWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    width += code >= 0x2e80 && code <= 0xff60 ? 2 : 1;
  }
  return width;
}

function stripInline(value: string): string {
  return value
    .replace(/\\\|/g, "|")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return trimmed.split(/(?<!\\)\|/u).map((cell) => stripInline(cell).trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/u.test(line);
}

function wrapPlainLine(line: string, width: number): string[] {
  if (line.length === 0) return [""];
  return wrapAnsi(line, Math.max(8, width), {
    hard: true,
    trim: false,
    wordWrap: true,
  }).split("\n");
}

function truncateCell(value: string, maxWidth: number): string {
  if (visualWidth(value) <= maxWidth) return value;
  let out = "";
  let width = 0;
  for (const char of value) {
    const nextWidth = visualWidth(char);
    if (width + nextWidth > Math.max(0, maxWidth - 3)) return `${out}...`;
    out += char;
    width += nextWidth;
  }
  return out;
}

function padCell(value: string, width: number): string {
  const fitted = truncateCell(value, width);
  return `${fitted}${" ".repeat(Math.max(0, width - visualWidth(fitted)))}`;
}

function parseBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: MarkdownBlock[] = [];
  let pendingParagraph: string[] = [];

  const flushParagraph = (): void => {
    if (pendingParagraph.length === 0) return;
    blocks.push({ type: "paragraph", lines: pendingParagraph });
    pendingParagraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    const fence = /^\s*```([\w-]+)?\s*$/u.exec(line);

    if (fence) {
      flushParagraph();
      const language = fence[1]?.trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/u.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", language, lines: codeLines });
      continue;
    }

    if (line.trim() && /^(=+|-+)\s*$/u.test(next.trim()) && !line.includes("|")) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: next.trim().startsWith("=") ? 1 : 2,
        text: line.trim(),
      });
      index += 1;
      continue;
    }

    if (line.includes("|") && isTableSeparator(next)) {
      flushParagraph();
      const rows: string[][] = [splitTableRow(line)];
      index += 2;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        if (!candidate.trim() || !candidate.includes("|")) break;
        rows.push(splitTableRow(candidate));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", rows });
      continue;
    }

    if (isHorizontalRule(line)) {
      flushParagraph();
      blocks.push({ type: "rule" });
      continue;
    }

    pendingParagraph.push(line);
  }

  flushParagraph();
  return blocks;
}

function tokenizeInline(text: string, baseKind: InlineKind = "plain"): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/gu;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: baseKind, text: text.slice(lastIndex, index) });
    }

    const token = match[0] ?? "";
    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      tokens.push({ kind: "bold", text: token.slice(2, -2) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      tokens.push({ kind: "code", text: ` ${token.slice(1, -1)} ` });
    } else {
      tokens.push({ kind: "italic", text: token.slice(1, -1) });
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: baseKind, text: text.slice(lastIndex) });
  }

  return tokens.filter((token) => token.text.length > 0);
}

function wrapInlineTokens(tokens: InlineToken[], width: number): InlineToken[][] {
  const rows: InlineToken[][] = [];
  const maxWidth = Math.max(8, width);
  let currentRow: InlineToken[] = [];
  let currentWidth = 0;

  const pushSegment = (kind: InlineKind, value: string): void => {
    if (!value) return;
    const last = currentRow[currentRow.length - 1];
    if (last && last.kind === kind) {
      last.text += value;
    } else {
      currentRow.push({ kind, text: value });
    }
  };

  const pushRow = (): void => {
    rows.push(currentRow.length > 0 ? currentRow : [{ kind: "plain", text: "" }]);
    currentRow = [];
    currentWidth = 0;
  };

  for (const token of tokens) {
    let segment = "";
    for (const char of token.text) {
      const charWidth = visualWidth(char);
      if (currentWidth > 0 && currentWidth + charWidth > maxWidth) {
        pushSegment(token.kind, segment);
        pushRow();
        segment = "";
      }

      segment += char;
      currentWidth += charWidth;

      if (currentWidth >= maxWidth) {
        pushSegment(token.kind, segment);
        pushRow();
        segment = "";
      }
    }

    if (segment) pushSegment(token.kind, segment);
  }

  if (currentRow.length > 0 || rows.length === 0) pushRow();
  return rows;
}

function lineTokens(line: string): InlineToken[][] {
  const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
  if (heading) {
    return [tokenizeInline(heading[2] ?? "", "heading")];
  }

  const quote = /^>\s?(.*)$/u.exec(line);
  if (quote) {
    return [[
      { kind: "quote", text: "| " },
      ...tokenizeInline(quote[1] ?? "", "quote"),
    ]];
  }

  const bullet = /^(\s*)([-*+])\s+(.*)$/u.exec(line);
  if (bullet) {
    return [[
      { kind: "bullet", text: `${bullet[1] ?? ""}- ` },
      ...tokenizeInline(bullet[3] ?? "", "plain"),
    ]];
  }

  const numbered = /^(\s*)(\d+\.)\s+(.*)$/u.exec(line);
  if (numbered) {
    return [[
      { kind: "bullet", text: `${numbered[1] ?? ""}${numbered[2] ?? ""} ` },
      ...tokenizeInline(numbered[3] ?? "", "plain"),
    ]];
  }

  return [tokenizeInline(line)];
}

function wrappedTokenRows(line: string, width: number): InlineToken[][] {
  if (!line.trim()) return [[{ kind: "plain", text: "" }]];
  return lineTokens(line).flatMap((tokens) => wrapInlineTokens(tokens, width));
}

function renderTableRows(rows: string[][], width: number): MarkdownRenderRow[] {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const cellBudget = Math.max(1, Math.floor((Math.max(12, width) - (columnCount * 3) - 1) / columnCount));
  const widths = Array.from({ length: columnCount }, (_, column) =>
    Math.min(
      Math.max(1, ...rows.map((row) => visualWidth(row[column] ?? ""))),
      Math.max(1, Math.min(24, cellBudget)),
    ));

  const border = `+${widths.map((cellWidth) => "-".repeat(cellWidth + 2)).join("+")}+`;
  const rowText = (row: string[]): string =>
    `| ${widths.map((cellWidth, column) => padCell(row[column] ?? "", cellWidth)).join(" | ")} |`;

  const rendered: MarkdownRenderRow[] = [{ type: "table", text: border, tone: "border" }];
  rows.forEach((row, rowIndex) => {
    rendered.push({
      type: "table",
      text: rowText(row),
      tone: rowIndex === 0 ? "header" : "body",
    });
    if (rowIndex === 0) {
      rendered.push({ type: "table", text: border, tone: "border" });
    }
  });
  rendered.push({ type: "table", text: border, tone: "border" });
  return rendered;
}

export function renderMarkdownRows(text: string, width: number): MarkdownRenderRow[] {
  const blocks = parseBlocks(text);
  const rows: MarkdownRenderRow[] = [];

  for (const block of blocks) {
    if (block.type === "heading") {
      rows.push({
        type: "inline",
        tokens: tokenizeInline(block.text, "heading"),
      });
      continue;
    }

    if (block.type === "rule") {
      rows.push({ type: "rule", text: "-".repeat(Math.max(8, width)) });
      continue;
    }

    if (block.type === "table") {
      rows.push(...renderTableRows(block.rows, width));
      continue;
    }

    if (block.type === "code") {
      for (const line of block.lines.length > 0 ? block.lines : [""]) {
        for (const wrapped of wrapPlainLine(line, width)) {
          rows.push({ type: "code", text: wrapped });
        }
      }
      continue;
    }

    for (const line of block.lines) {
      for (const wrapped of wrappedTokenRows(line, width)) {
        rows.push({ type: "inline", tokens: wrapped });
      }
    }
  }

  return rows.length > 0 ? rows : [{ type: "inline", tokens: [{ kind: "plain", text: "" }] }];
}

function renderToken(token: InlineToken, theme: TuiTheme, key: string): React.ReactElement {
  if (token.kind === "bold") {
    return <Text key={key} bold color={theme.colors.fg}>{token.text}</Text>;
  }
  if (token.kind === "italic") {
    return <Text key={key} italic color={theme.colors.textSecondary}>{token.text}</Text>;
  }
  if (token.kind === "code") {
    return (
      <Text key={key} color={theme.colors.info} backgroundColor={theme.colors.surfaceOverlay}>
        {token.text}
      </Text>
    );
  }
  if (token.kind === "heading") {
    return <Text key={key} bold color={theme.colors.brand}>{token.text}</Text>;
  }
  if (token.kind === "quote") {
    return <Text key={key} italic color={theme.colors.textSecondary}>{token.text}</Text>;
  }
  if (token.kind === "bullet") {
    return <Text key={key} color={theme.colors.brand} bold>{token.text}</Text>;
  }
  return <Text key={key} color={theme.colors.fg}>{token.text}</Text>;
}

export function estimateMarkdownRows(text: string, width: number): number {
  return renderMarkdownRows(text, width).length;
}

export function renderMarkdownToAnsi(text: string): string {
  return renderMarkdownRows(text, 80)
    .map((row) =>
      row.type === "inline"
        ? row.tokens.map((token) => token.text).join("")
        : row.text)
    .join("\n");
}

export function MarkdownText({
  text,
  theme,
  width,
  startRow = 0,
  rowCount,
}: {
  text: string;
  theme: TuiTheme;
  width: number;
  startRow?: number;
  rowCount?: number;
}): React.ReactElement {
  const rows = useMemo(() => renderMarkdownRows(text, width), [text, width]);
  const visibleRows = rows.slice(startRow, rowCount === undefined ? rows.length : startRow + rowCount);

  return (
    <Box flexDirection="column">
      {visibleRows.map((row, rowIndex) => {
        if (row.type === "inline") {
          return (
            <Box key={`md_inline_${rowIndex}`} height={1} overflow="hidden">
              {row.tokens.map((token, tokenIndex) =>
                renderToken(token, theme, `tok_${rowIndex}_${tokenIndex}`),
              )}
            </Box>
          );
        }

        if (row.type === "code") {
          return (
            <Box
              key={`md_code_${rowIndex}`}
              height={1}
              overflow="hidden"
              backgroundColor={theme.colors.surfaceOverlay}
            >
              <Text color={theme.colors.textSecondary}>{row.text || " "}</Text>
            </Box>
          );
        }

        if (row.type === "rule") {
          return (
            <Text key={`md_rule_${rowIndex}`} color={theme.colors.borderDefault}>
              {row.text}
            </Text>
          );
        }

        return (
          <Text
            key={`md_table_${rowIndex}`}
            color={
              row.tone === "border"
                ? theme.colors.borderDefault
                : row.tone === "header"
                  ? theme.colors.textSecondary
                  : theme.colors.fg
            }
          >
            {row.text}
          </Text>
        );
      })}
    </Box>
  );
}
