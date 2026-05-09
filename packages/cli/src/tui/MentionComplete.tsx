import React from "react";
import { Box, Text } from "ink";
import type { TuiTheme } from "./theme.js";

export interface MentionItem {
  label: string;
  relativePath: string;
  absolutePath: string;
  category:
    | "file"
    | "dir"
    | "skill"
    | "mcp"
    | "memory"
    | "task"
    | "subagent"
    | "trace"
    | "git"
    | "artifact";
}

interface MentionCompleteProps {
  items: MentionItem[];
  selectedIndex: number;
  theme?: TuiTheme;
}

function short(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

export function MentionComplete({
  items,
  selectedIndex,
  theme,
}: MentionCompleteProps): React.ReactElement {
  const windowSize = 8;
  const safeIdx = Math.min(selectedIndex, Math.max(0, items.length - 1));
  const start = Math.max(
    0,
    Math.min(safeIdx - Math.floor(windowSize / 2), items.length - windowSize),
  );
  const end = Math.min(items.length, start + windowSize);
  const visible = items.slice(start, end);
  const bg = theme?.colors.surfaceSunken ?? "#080A0D";
  const fg = theme?.colors.fg ?? "#E6EAF0";
  const muted = theme?.colors.textTertiary ?? "#677080";
  const selected = theme?.colors.brand ?? "#7AA2F7";

  return (
    <Box flexDirection="column" paddingX={2} backgroundColor={bg}>
      <Text color={muted}>Context {items.length > windowSize ? `${safeIdx + 1}/${items.length}` : ""}</Text>
      {visible.length === 0 ? (
        <Text color={muted}>  No matches</Text>
      ) : (
        visible.map((item, index) => {
          const absoluteIndex = start + index;
          const isSelected = absoluteIndex === safeIdx;
          return (
            <Box key={`${item.category}-${item.relativePath}`}>
              <Text color={isSelected ? selected : muted}>{isSelected ? "> " : "  "}</Text>
              <Text color={isSelected ? selected : fg}>@{short(item.label, 36)}</Text>
              {isSelected && (item.category === "file" || item.category === "dir") && (
                <Text color={muted}>  {short(item.absolutePath, 48)}</Text>
              )}
            </Box>
          );
        })
      )}
    </Box>
  );
}
