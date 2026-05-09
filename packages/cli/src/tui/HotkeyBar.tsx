import React from "react";
import { Box, Text } from "ink";
import type { FocusArea } from "./key-handler.js";
import type { TuiTheme } from "./theme.js";

interface HotkeyBarProps {
  paletteActive: boolean;
  focusArea: FocusArea;
  theme: TuiTheme;
  leaderLabel: string;
}

function K({ children, theme }: { children: string; theme: TuiTheme }): React.ReactElement {
  return <Text color={theme.colors.textSecondary}>{children}</Text>;
}

export function HotkeyBar({
  paletteActive,
  focusArea,
  theme,
  leaderLabel,
}: HotkeyBarProps): React.ReactElement {
  const cols = process.stdout.columns ?? 80;
  const isCompact = cols < 84;

  if (focusArea === "scroll") {
    return (
      <Box paddingX={2} backgroundColor={theme.colors.surfaceRaised}>
        <Text color={theme.colors.textTertiary}>
          <K theme={theme}>Up/Down</K> line  <K theme={theme}>PgUp/PgDn</K> page  <K theme={theme}>g/G</K> top/end  <K theme={theme}>Esc</K> input
        </Text>
      </Box>
    );
  }

  if (paletteActive) {
    return (
      <Box paddingX={2} backgroundColor={theme.colors.surfaceRaised}>
        <Text color={theme.colors.textTertiary}>
          <K theme={theme}>Up/Down</K> select  <K theme={theme}>Tab</K> complete  <K theme={theme}>Esc</K> cancel  <K theme={theme}>Enter</K> send
        </Text>
      </Box>
    );
  }

  return (
    <Box paddingX={2} backgroundColor={theme.colors.surfaceRaised}>
      <Text color={theme.colors.textTertiary}>
        <K theme={theme}>/</K> commands  <K theme={theme}>/models</K> provider  <K theme={theme}>@</K> context  <K theme={theme}>!</K> shell
        {!isCompact && (
          <>
            {"  "}<K theme={theme}>PgUp/PgDn</K> scroll  <K theme={theme}>{`${leaderLabel} b`}</K> sidebar
          </>
        )}
      </Text>
    </Box>
  );
}
