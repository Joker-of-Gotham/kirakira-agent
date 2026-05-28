import React from "react";
import { Box, Text } from "ink";
import type { TuiTheme } from "./theme.js";

interface HomeScreenProps {
  theme: TuiTheme;
  children: React.ReactNode;
}

const PIXEL_HEART = [
  "  ▄██▄   ▄██▄  ",
  " ██████ ██████ ",
  "  ▀█████████▀  ",
  "    ▀█████▀    ",
  "      ▀▀▀      ",
];

const LOGO = [
  "██╗  ██╗██╗██████╗  █████╗ ██╗  ██╗██╗██████╗  █████╗",
  "██║ ██╔╝██║██╔══██╗██╔══██╗██║ ██╔╝██║██╔══██╗██╔══██╗",
  "█████╔╝ ██║██████╔╝███████║█████╔╝ ██║██████╔╝███████║",
  "██╔═██╗ ██║██╔══██╗██╔══██║██╔═██╗ ██║██╔══██╗██╔══██║",
  "██║  ██╗██║██║  ██║██║  ██║██║  ██╗██║██║  ██║██║  ██║",
  "╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝",
];

const COMPACT_LOGO = [
  "██╗ ██╗██╗█████╗  █████╗",
  "██║██╔╝██║██╔══██╗██╔══██╗",
  "████╔╝ ██║█████╔╝ ███████║",
  "██╔██╗ ██║██╔═██╗ ██╔══██║",
  "██║ ██╗██║██║ ██╗ ██║  ██║",
  "╚═╝ ╚═╝╚═╝╚═╝ ╚═╝ ╚═╝  ╚═╝",
];

export function HomeScreen({ theme, children }: HomeScreenProps): React.ReactElement {
  const cols = process.stdout.columns ?? 80;
  const compact = cols < 100;
  const visibleLogo = compact ? COMPACT_LOGO : LOGO;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      paddingX={compact ? 3 : 6}
      backgroundColor={theme.colors.bg}
    >
      <Box flexDirection="column" alignItems="center" marginBottom={3}>
        {!compact && (
          <Box flexDirection="column" alignItems="center" marginBottom={1}>
            {PIXEL_HEART.map((line, index) => (
              <Text key={`heart_${index}`} color={theme.colors.brand} bold>
                {line}
              </Text>
            ))}
          </Box>
        )}
        {visibleLogo.map((line, index) => (
          <Text
            key={`${line}_${index}`}
            color={index === visibleLogo.length - 1 ? theme.colors.accentMuted : theme.colors.brand}
            bold
          >
            {line}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" width="100%">
        {children}
      </Box>
      <Box justifyContent="center" marginTop={2}>
        <Text color={theme.colors.textTertiary}>type / for commands  ·  /mcp opens MCPs</Text>
      </Box>
    </Box>
  );
}
