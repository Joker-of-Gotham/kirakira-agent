import React from "react";
import { Box, Text } from "ink";
import type { ApprovalRequest } from "./types.js";

interface ApprovalCardProps {
  request: ApprovalRequest;
}

function KeyHint({ k, label }: { k: string; label: string }): React.ReactElement {
  return (
    <>
      <Text color="cyan" bold>[{k}]</Text>
      <Text> {label}  </Text>
    </>
  );
}

export function ApprovalCard({
  request,
}: ApprovalCardProps): React.ReactElement {
  const { detail } = request;

  const borderColor =
    detail.type === "shell" ? "yellow" :
    detail.type === "mcp" ? "cyan" : "magenta";

  const title =
    detail.type === "shell" ? "Shell Approval" :
    detail.type === "mcp" ? "MCP Approval" : "Write Approval";

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={borderColor}
      paddingX={2}
      paddingY={1}
      marginX={1}
    >
      <Text bold color={borderColor}>
        ⚠ {title} Required
      </Text>

      <Box marginTop={1} flexDirection="column">
        {detail.type === "shell" && (
          <>
            <Box>
              <Text bold>Command:   </Text>
              <Text color="white">{detail.command}</Text>
            </Box>
            <Box>
              <Text bold>Scope:     </Text>
              <Text>{detail.scope}</Text>
            </Box>
            <Box>
              <Text bold>Risk:      </Text>
              <Text
                color={
                  detail.risk === "high" ? "red" :
                  detail.risk === "medium" ? "yellow" : "green"
                }
              >
                {detail.risk}
              </Text>
            </Box>
          </>
        )}

        {detail.type === "mcp" && (
          <>
            <Box>
              <Text bold>Server:    </Text>
              <Text color="white">{detail.server}</Text>
            </Box>
            <Box>
              <Text bold>Tool:      </Text>
              <Text>{detail.tool}</Text>
            </Box>
            {detail.url && (
              <Box>
                <Text bold>URL:       </Text>
                <Text dimColor>{detail.url}</Text>
              </Box>
            )}
          </>
        )}

        {detail.type === "write" && (
          <>
            <Box>
              <Text bold>Path:      </Text>
              <Text color="white">{detail.path}</Text>
            </Box>
            <Box>
              <Text bold>Operation: </Text>
              <Text>{detail.operation}</Text>
            </Box>
            {detail.preview && (
              <Box>
                <Text bold>Preview:   </Text>
                <Text dimColor>{detail.preview.slice(0, 200)}</Text>
              </Box>
            )}
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <KeyHint k="y" label="allow" />
        <KeyHint k="!" label="allow session" />
        <KeyHint k="n" label="deny" />
        <KeyHint k="#" label="block" />
        <KeyHint k="v" label="details" />
      </Box>
    </Box>
  );
}
