import React from "react";
import { Box, Text } from "ink";
import type { TuiTheme } from "./theme.js";

interface HomeScreenProps {
  theme: TuiTheme;
  children: React.ReactNode;
}

const LOGO = [
  "██╗  ██╗██╗██████╗  █████╗ ██╗  ██╗██╗██████╗  █████╗",
  "██║ ██╔╝██║██╔══██╗██╔══██╗██║ ██╔╝██║██╔══██╗██╔══██╗",
  "█████╔╝ ██║██████╔╝███████║█████╔╝ ██║██████╔╝███████║",
  "██╔═██╗ ██║██╔══██╗██╔══██║██╔═██╗ ██║██╔══██╗██╔══██║",
  "██║  ██╗██║██║  ██║██║  ██║██║  ██╗██║██║  ██║██║  ██║",
  "╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝",
];

export function HomeScreen({ theme, children }: HomeScreenProps): React.ReactElement {
  const cols = process.stdout.columns ?? 80;
  const compact = cols < 92;
  const visibleLogo = compact
    ? [
        "██╗  ██╗██╗██████╗  █████╗",
        "██║ ██╔╝██║██╔══██╗██╔══██╗",
        "█████╔╝ ██║██████╔╝███████║",
        "██╔═██╗ ██║██╔══██╗██╔══██║",
        "██║  ██╗██║██║  ██║██║  ██║",
        "╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝",
      ]
    : LOGO;

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4} backgroundColor={theme.colors.bg}>
      <Box flexDirection="column" alignItems="center" marginBottom={2}>
        {visibleLogo.map((line, index) => (
          <Text
            key={`${line}_${index}`}
            color={index === visibleLogo.length - 1 ? theme.colors.textTertiary : theme.colors.fg}
            bold
          >
            {line}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" width="100%">
        {children}
      </Box>
      <Box justifyContent="center" marginTop={1}>
        <Text color={theme.colors.textTertiary}>type / for commands · /mcp opens MCPs · ctrl+r toggles tool details</Text>
      </Box>
    </Box>
  );
}
