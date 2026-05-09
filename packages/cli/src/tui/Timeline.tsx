import React from "react";
import { Box, Text } from "ink";
import type { FocusArea } from "./key-handler.js";
import type { TimelineRenderLine } from "./timeline-lines.js";
import type { TuiTheme } from "./theme.js";

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
}

function ProgressiveHomepage({
  theme,
  resumeItems = [],
}: {
  theme: TuiTheme;
  resumeItems: SessionResumeItem[];
}): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={4} paddingY={2} justifyContent="center">
      <Text color={theme.colors.brand} bold>kirakira-agent</Text>
      <Text color={theme.colors.textSecondary}>Interactive agent workspace</Text>
      <Text> </Text>
      <Text color={theme.colors.textTertiary}>Start typing to chat. Use /models or /config setup to change provider and model.</Text>
      <Text color={theme.colors.textTertiary}>Use @ to attach files, ! to run shell commands, and Ctrl+C to exit.</Text>

      {resumeItems.length > 0 && (
        <>
          <Text> </Text>
          <Text color={theme.colors.textSecondary} bold>Recent sessions</Text>
          {resumeItems.slice(0, 3).map((item) => (
            <Text key={item.id} color={theme.colors.textTertiary}>
              {item.status === "running" ? "*" : "-"} {item.title}  {item.updatedAt}
            </Text>
          ))}
        </>
      )}
    </Box>
  );
}

export function Timeline({
  lines,
  hasContent,
  scrollOffset,
  visibleCount,
  focusArea,
  theme,
  resumeItems = [],
}: TimelineProps): React.ReactElement {
  const total = lines.length;
  const hasBelowIndicator = scrollOffset > 0;
  const endIdx = Math.max(0, total - scrollOffset);
  const tentativeStart = Math.max(0, endIdx - visibleCount);
  const hasAboveIndicator = tentativeStart > 0;
  const reservedRows = (hasAboveIndicator ? 1 : 0) + (hasBelowIndicator ? 1 : 0);
  const adjustedCount = Math.max(1, visibleCount - reservedRows);
  const startIdx = Math.max(0, endIdx - adjustedCount);
  const visible = lines.slice(startIdx, endIdx);
  const inScroll = focusArea === "scroll";

  if (!hasContent) {
    return <ProgressiveHomepage theme={theme} resumeItems={resumeItems} />;
  }

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      {startIdx > 0 && (
        <Text color={inScroll ? theme.colors.warning : theme.colors.textTertiary} dimColor={!inScroll}>
          {startIdx} earlier lines
        </Text>
      )}

      {visible.map((line) => (
        <Text key={line.id} color={line.color} dimColor={line.dim} bold={line.bold}>
          {line.text}
        </Text>
      ))}

      <Box flexGrow={1} />

      {scrollOffset > 0 && (
        <Text color={inScroll ? theme.colors.warning : theme.colors.textTertiary} dimColor={!inScroll}>
          {scrollOffset} newer lines
        </Text>
      )}
    </Box>
  );
}
