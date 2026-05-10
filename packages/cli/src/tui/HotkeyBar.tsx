import React from "react";
import { Box, Text } from "ink";
import type { FocusArea } from "./key-handler.js";
import type { TuiTheme } from "./theme.js";

interface HotkeyBarProps {
  paletteActive: boolean;
  focusArea: FocusArea;
  theme: TuiTheme;
  toolResultsExpanded: boolean;
}

function K({ children, theme }: { children: string; theme: TuiTheme }): React.ReactElement {
  return <Text color={theme.colors.textSecondary}>{children}</Text>;
}

function HintBar({ children, theme }: { children: React.ReactNode; theme: TuiTheme }): React.ReactElement {
  return (
    <Box height={1} flexShrink={0} overflow="hidden" paddingX={4} backgroundColor={theme.colors.bg} justifyContent="flex-end">
      <Text color={theme.colors.textTertiary} wrap="truncate-end">{children}</Text>
    </Box>
  );
}

export function HotkeyBar({
  paletteActive,
  focusArea,
  theme,
  toolResultsExpanded,
}: HotkeyBarProps): React.ReactElement {
  if (focusArea === "scroll") {
    return (
      <HintBar theme={theme}>
        <K theme={theme}>/</K> commands  <K theme={theme}>ctrl+r</K> {toolResultsExpanded ? "collapse tool details" : "expand tool details"}
      </HintBar>
    );
  }

  if (paletteActive) {
    return (
      <HintBar theme={theme}>
        <K theme={theme}>/</K> command palette
      </HintBar>
    );
  }

  return (
    <HintBar theme={theme}>
      <K theme={theme}>/</K> commands  <K theme={theme}>ctrl+r</K> {toolResultsExpanded ? "collapse tool details" : "expand tool details"}
    </HintBar>
  );
}
