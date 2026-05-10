import React from "react";
import { Box, Text } from "ink";
import type { TuiMode } from "./types.js";
import { MODE_META } from "./types.js";
import type { FocusArea } from "./key-handler.js";
import type { TuiTheme } from "./theme.js";
import { useTicker } from "./hooks/useTicker.js";

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
  scrollLimit?: number;
  theme: TuiTheme;
  totalTasks?: number;
  completedTasks?: number;
  thinking?: boolean;
  mcpReady?: boolean;
  mcpHealthy?: number;
  mcpTotal?: number;
  activeToolName?: string;
}

function fit(value: string, width: number): string {
  if (width <= 0) return "";
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, Math.max(0, width - 3))}...`;
}

function pad(value: string, width: number): string {
  const fitted = fit(value, width);
  return `${fitted}${" ".repeat(Math.max(0, width - fitted.length))}`;
}

function compactPathLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
  scrollLimit = timelineLength,
  theme,
  totalTasks = 0,
  completedTasks = 0,
  thinking = false,
  mcpReady = true,
  mcpHealthy = 0,
  mcpTotal = 0,
  activeToolName,
}: StatusBarProps): React.ReactElement {
  const cols = Math.max(40, process.stdout.columns ?? 80);
  const innerWidth = Math.max(1, cols - 4);
  const meta = MODE_META[mode];
  const branch = gitBranch && gitBranch !== "?" ? gitBranch : "";
  const showProgress = totalTasks > 0 && completedTasks < totalTasks;
  const busy = thinking || taskCount > 0 || (!mcpReady && mcpTotal > 0);
  const tick = useTicker(busy, 120);
  const spin = busy ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][tick % 10] ?? "⠋" : "";
  const compact = cols < 96;

  const workspace = compactPathLabel(workspaceName);
  const left = compact
    ? "kirakira"
    : `kirakira / ${workspace}${branch ? ` @ ${branch}` : ""}`;

  const middleParts: string[] = [];
  if (busy) {
    middleParts.push(activeToolName ? `${spin} ${activeToolName}` : `${spin}`);
  }
  if (showProgress) {
    middleParts.push(`tasks ${completedTasks}/${totalTasks}`);
  } else if (taskCount > 0) {
    middleParts.push(`tasks ${taskCount}`);
  }
  if (mcpTotal > 0 && (!mcpReady || mcpHealthy < mcpTotal)) {
    middleParts.push(!mcpReady ? `mcp starting ${mcpHealthy}/${mcpTotal}` : `mcp ${mcpHealthy}/${mcpTotal}`);
  }
  if (pendingApprovals > 0) middleParts.push(`approval ${pendingApprovals}`);
  if (memoryHits > 0) middleParts.push(`mem ${memoryHits}`);
  if (focusArea === "scroll" || scrollOffset > 0) {
    middleParts.push(`scroll ${scrollOffset}/${scrollLimit}`);
  }
  const middle = middleParts.join("  ");

  const rightParts = [meta.label, model];
  if (!compact && trust !== "trusted") rightParts.push(trust);
  if (!compact) rightParts.push(`ses ${traceId.slice(0, 8)}`);
  const right = rightParts.join("  ");

  const minRight = Math.min(compact ? 10 : 20, innerWidth);
  const rightWidth = Math.min(Math.max(minRight, right.length), Math.max(10, Math.floor(innerWidth * 0.32)));
  const middleCap = Math.max(0, innerWidth - rightWidth - 2);
  const desiredMiddle = middle ? Math.min(middle.length, compact ? 18 : 30, middleCap) : 0;
  const leftWidth = Math.max(0, innerWidth - rightWidth - desiredMiddle - (desiredMiddle > 0 ? 2 : 1));
  const middleWidth = Math.max(0, innerWidth - rightWidth - leftWidth - 2);

  const leftText = middleWidth > 0 ? pad(left, leftWidth) : pad(left, Math.max(0, innerWidth - rightWidth - 1));
  const middleText = middleWidth > 0 ? pad(middle, middleWidth) : "";
  const rightText = fit(right, rightWidth);

  return (
    <Box width={cols} height={1} flexShrink={0} overflow="hidden" paddingX={2} backgroundColor={theme.colors.surfaceSunken}>
      <Text color={theme.colors.brand} bold wrap="truncate-end">{leftText}</Text>
      <Text color={theme.colors.textTertiary}> </Text>
      {middleWidth > 0 && (
        <>
          <Text color={busy ? theme.colors.accentMuted : theme.colors.textTertiary} wrap="truncate-end">{middleText}</Text>
          <Text color={theme.colors.textTertiary}> </Text>
        </>
      )}
      <Text color={theme.colors.textTertiary} wrap="truncate-end">{rightText}</Text>
    </Box>
  );
}
