import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandDef } from "./types.js";
import type { TuiTheme } from "./theme.js";

interface SlashPaletteProps {
  items: SlashCommandDef[];
  selectedIndex: number;
  theme?: TuiTheme;
}

export function SlashPalette({
  items,
  selectedIndex,
  theme,
}: SlashPaletteProps): React.ReactElement {
  const windowSize = 8;
  const safeIdx = Math.min(selectedIndex, items.length - 1);
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
      <Text color={muted}>Commands {items.length > windowSize ? `${safeIdx + 1}/${items.length}` : ""}</Text>
      {visible.map((item, index) => {
        const absoluteIndex = start + index;
        const isSelected = absoluteIndex === safeIdx;
        return (
          <Box key={item.name}>
            <Text color={isSelected ? selected : muted}>{isSelected ? "> " : "  "}</Text>
            <Text color={isSelected ? selected : fg}>/{item.name}</Text>
            <Text color={muted}>  {item.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
