import React from "react";
import { Box, Text } from "ink";
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
  theme: TuiTheme;
  model?: string;
  attachments?: Attachment[];
  taskCount?: number;
  tokenCount?: number;
  activeToolName?: string;
}

function shorten(value: string, max: number): string {
  return value.length > max ? `...${value.slice(-(max - 3))}` : value;
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
  value,
  cursorIndex,
  focused,
  theme,
}: {
  value: string;
  cursorIndex: number;
  focused: boolean;
  theme: TuiTheme;
}): React.ReactElement {
  if (!value) {
    return <Text color={theme.colors.textTertiary}>Ask anything...</Text>;
  }

  const cursor = clampCursor(value, cursorIndex);
  const before = value.slice(0, cursor);
  const current = value.slice(cursor, cursor + 1);
  const after = value.slice(cursor + 1);

  return (
    <>
      {before && <Text color={theme.colors.fg}>{before}</Text>}
      {focused ? (
        current ? (
          <Text color={theme.colors.textInverse} backgroundColor={theme.colors.brand}>
            {current}
          </Text>
        ) : (
          <Text color={theme.colors.brand}>_</Text>
        )
      ) : current ? (
        <Text color={theme.colors.fg}>{current}</Text>
      ) : null}
      {after && <Text color={theme.colors.fg}>{after}</Text>}
    </>
  );
}

export function InputArea({
  value,
  cursorIndex,
  mode,
  thinking,
  focused = true,
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
  const primaryText = thinking
    ? activeToolName
      ? `running ${shorten(activeToolName, 40)}`
      : "model is working"
    : value || "Ask anything...";
  const modelLabel = model ? shorten(model, isCompact ? 18 : 24) : "model";

  return (
    <Box flexDirection="column" flexShrink={0} marginTop={0}>
      {focused && <ContextLine attachments={attachments} theme={theme} />}

      <Box paddingX={4} flexShrink={0} backgroundColor={theme.colors.bg} width="100%">
        <Box flexDirection="row" flexShrink={0} backgroundColor={theme.colors.surfaceRaised} width="100%">
          <Box width={1} flexShrink={0} backgroundColor={theme.colors.brand} />
          <Box width="100%" flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingX={2}>
            <Box height={1} overflow="hidden">
              {thinking && (
                <>
                  <Spinner active color={activeToolName ? theme.colors.tool : theme.colors.reasoning} />
                  <Text> </Text>
                </>
              )}
              {!thinking && (
                <>
                  <Text color={theme.colors.success} bold>$</Text>
                  <Text color={theme.colors.textTertiary}> </Text>
                </>
              )}
              {thinking ? (
                <Text color={theme.colors.textSecondary} wrap="truncate-end">
                  {primaryText}
                </Text>
              ) : (
                <EditableText
                  value={value}
                  cursorIndex={cursorIndex}
                  focused={focused}
                  theme={theme}
                />
              )}
            </Box>
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
