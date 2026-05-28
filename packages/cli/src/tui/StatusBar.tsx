import React from "react";
import { Box, Text } from "ink";
import type { TuiTheme } from "./theme.js";

interface StatusBarProps {
  workspaceName: string;
  gitBranch: string;
  trust: string;
  model: string;
  mode: string;
  traceId: string;
  taskCount: number;
  pendingApprovals: number;
  memoryHits: number;
  focusArea: string;
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
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= width) return clean;
  if (width <= 3) return clean.slice(0, width);
  return `${clean.slice(0, Math.max(0, width - 3))}...`;
}

function sessionAlias(traceId: string): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  let hash = 0;
  for (const char of traceId) {
    hash = ((hash * 33) + char.charCodeAt(0)) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += alphabet[(hash >> (i * 5)) & 31] ?? "k";
  }
  return `s-${out}`;
}

export function StatusBar({
  workspaceName,
  gitBranch,
  traceId,
  theme,
}: StatusBarProps): React.ReactElement {
  const cols = Math.max(40, process.stdout.columns ?? 80);
  const compact = cols < 92;
  const branch = gitBranch && gitBranch !== "?" ? gitBranch : "";
  const folderWidth = compact ? 24 : Math.max(18, Math.floor(cols * 0.28));
  const branchWidth = compact ? 20 : Math.max(20, Math.floor(cols * 0.34));

  return (
    <Box
      width={cols}
      height={1}
      flexShrink={0}
      overflow="hidden"
      paddingX={2}
      backgroundColor={theme.colors.surfaceSunken}
      justifyContent="space-between"
    >
      <Box flexShrink={1} overflow="hidden">
        <Text color={theme.colors.brand} bold>kirakira</Text>
        <Text color={theme.colors.textTertiary}>  </Text>
        <Text color={theme.colors.fg} bold wrap="truncate-end">
          {fit(workspaceName, folderWidth)}
        </Text>
        {branch && (
          <>
            <Text color={theme.colors.textTertiary}>  @ </Text>
            <Text color={theme.colors.textSecondary} wrap="truncate-end">
              {fit(branch, branchWidth)}
            </Text>
          </>
        )}
      </Box>
      <Text color={theme.colors.textTertiary}>{sessionAlias(traceId)}</Text>
    </Box>
  );
}
