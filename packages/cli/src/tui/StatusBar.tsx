import React from "react";
import { Box, Text } from "ink";
import type { TuiMode } from "./types.js";
import { MODE_META } from "./types.js";
import type { FocusArea } from "./key-handler.js";
import type { TuiTheme } from "./theme.js";

interface StatusBarProps {
  workspaceName: string;
  gitBranch: string;
  trust: string;
  model: string;
  mode: TuiMode;
  traceId: string;
  taskCount: number;
  pendingApprovals: number;
  memoryHits: number;
  focusArea: FocusArea;
  scrollOffset: number;
  timelineLength: number;
  theme: TuiTheme;
  totalTasks?: number;
  completedTasks?: number;
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

export function StatusBar({
  workspaceName,
  gitBranch,
  trust,
  model,
  mode,
  traceId,
  taskCount,
  pendingApprovals,
  memoryHits,
  focusArea,
  scrollOffset,
  timelineLength,
  theme,
  totalTasks = 0,
  completedTasks = 0,
}: StatusBarProps): React.ReactElement {
  const meta = MODE_META[mode];
  const cols = process.stdout.columns ?? 80;
  const isCompact = cols < 80;
  const branch = gitBranch && gitBranch !== "?" ? gitBranch : "";
  const showProgress = totalTasks > 0 && completedTasks < totalTasks;
  const progressWidth = 10;
  const progressFilled = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * progressWidth)
    : 0;
  const progressBar = showProgress
    ? `${"=".repeat(progressFilled)}${"-".repeat(progressWidth - progressFilled)}`
    : "";

  return (
    <Box width="100%" paddingX={2} justifyContent="space-between" backgroundColor={theme.colors.surfaceRaised}>
      <Box>
        {focusArea === "scroll" && (
          <Text color={theme.colors.warning} bold>
            SCROLL{scrollOffset > 0 ? ` ${scrollOffset}/${timelineLength}` : ""}{"  "}
          </Text>
        )}
        {pendingApprovals > 0 && (
          <Text color={theme.colors.approval} bold>approval {pendingApprovals}{"  "}</Text>
        )}
        <Text color={theme.colors.brand} bold>kirakira</Text>
        <Text color={theme.colors.textTertiary}> / </Text>
        {!isCompact && (
          <>
            <Text color={theme.colors.textSecondary}>{shorten(workspaceName, 22)}</Text>
            {branch && (
              <>
                <Text color={theme.colors.textTertiary}> @ </Text>
                <Text color={theme.colors.textSecondary}>{shorten(branch, 18)}</Text>
              </>
            )}
            <Text color={theme.colors.textTertiary}> | </Text>
          </>
        )}
        <Text color={meta.color} bold>{meta.label}</Text>
        <Text color={theme.colors.textTertiary}> | </Text>
        <Text color={theme.colors.textSecondary}>{shorten(model, isCompact ? 18 : 28)}</Text>
      </Box>

      {showProgress && !isCompact && (
        <Box>
          <Text color={theme.colors.info}>{progressBar} {completedTasks}/{totalTasks}</Text>
        </Box>
      )}

      <Box>
        {taskCount > 0 && (
          <>
            <Text color={theme.colors.info}>tasks {taskCount}</Text>
            <Text color={theme.colors.textTertiary}> | </Text>
          </>
        )}
        {!isCompact && (
          <>
            <Text color={theme.colors.textTertiary}>session </Text>
            <Text color={theme.colors.textSecondary}>{traceId.slice(0, 8)}</Text>
            <Text color={theme.colors.textTertiary}> | </Text>
          </>
        )}
        {memoryHits > 0 && (
          <>
            <Text color={theme.colors.memory}>mem {memoryHits}</Text>
            <Text color={theme.colors.textTertiary}> | </Text>
          </>
        )}
        {trust !== "trusted" && (
          <>
            <Text color={theme.colors.warning}>{trust}</Text>
            <Text color={theme.colors.textTertiary}> | </Text>
          </>
        )}
        <Text dimColor color={theme.colors.textTertiary}>Ctrl+C</Text>
      </Box>
    </Box>
  );
}
