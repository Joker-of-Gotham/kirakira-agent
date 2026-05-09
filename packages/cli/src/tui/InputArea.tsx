import React from "react";
import { Box, Text } from "ink";
import type { TuiMode } from "./types.js";
import { MODE_META } from "./types.js";
import type { TuiTheme } from "./theme.js";
import type { Attachment } from "../parser/mention.js";

interface InputAreaProps {
  value: string;
  mode: TuiMode;
  thinking: boolean;
  focused?: boolean;
  theme: TuiTheme;
  model?: string;
  attachments?: Attachment[];
  taskCount?: number;
  tokenCount?: number;
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
    <Box paddingX={2} backgroundColor={theme.colors.surfaceSunken}>
      <Text color={theme.colors.textTertiary}>context </Text>
      <Text color={theme.colors.textSecondary}>{rendered}</Text>
      {attachments.length > 4 && (
        <Text color={theme.colors.textTertiary}> +{attachments.length - 4}</Text>
      )}
    </Box>
  );
}

export function InputArea({
  value,
  mode,
  thinking,
  focused = true,
  theme,
  model,
  attachments = [],
  taskCount = 0,
  tokenCount,
}: InputAreaProps): React.ReactElement {
  const meta = MODE_META[mode];
  const cols = process.stdout.columns ?? 80;
  const isCompact = cols < 84;
  const promptColor = thinking ? theme.colors.warning : focused ? theme.colors.brand : theme.colors.textTertiary;
  const statusText = thinking
    ? "working..."
    : value
      ? "Enter send"
      : "/ commands  @ files  ! shell";

  return (
    <Box flexDirection="column" marginTop={0}>
      {focused && <ContextLine attachments={attachments} theme={theme} />}

      <Box paddingX={2} paddingY={0} backgroundColor={theme.colors.surfaceRaised} justifyContent="space-between">
        <Box flexGrow={1}>
          <Text color={promptColor} bold>{meta.label}</Text>
          <Text color={theme.colors.textTertiary}> {">"} </Text>
          {thinking ? (
            <Text color={theme.colors.warning}>waiting for model response</Text>
          ) : value ? (
            <Text color={theme.colors.fg}>{value}</Text>
          ) : (
            <Text color={theme.colors.textTertiary}>Ask anything...</Text>
          )}
          {focused && !thinking && value && <Text color={theme.colors.brand}>_</Text>}
        </Box>

        {!isCompact && (
          <Box marginLeft={2}>
            {model && (
              <>
                <Text color={theme.colors.textTertiary}>{shorten(model, 24)}</Text>
                <Text color={theme.colors.textTertiary}> | </Text>
              </>
            )}
            {taskCount > 0 && (
              <>
                <Text color={theme.colors.info}>{taskCount} running</Text>
                <Text color={theme.colors.textTertiary}> | </Text>
              </>
            )}
            {tokenCount !== undefined && tokenCount > 0 && (
              <>
                <Text color={theme.colors.textTertiary}>{tokenCount} tokens</Text>
                <Text color={theme.colors.textTertiary}> | </Text>
              </>
            )}
            <Text color={theme.colors.textTertiary}>{statusText}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
