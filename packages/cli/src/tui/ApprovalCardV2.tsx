import React from "react";
import { Box, Text } from "ink";
import type { ApprovalRequest, ApprovalRiskLevel } from "./types.js";
import type { TuiTheme } from "./theme.js";

interface ApprovalCardV2Props {
  request: ApprovalRequest;
  theme?: TuiTheme;
}

function KeyHint({
  k,
  label,
  color,
}: {
  k: string;
  label: string;
  color: string;
}): React.ReactElement {
  return (
    <>
      <Text color={color} bold>[{k}]</Text>
      <Text> {label} </Text>
    </>
  );
}

function resolveRiskLevel(request: ApprovalRequest): ApprovalRiskLevel {
  if (request.enrichment?.riskLevel) return request.enrichment.riskLevel;
  const d = request.detail;
  if (d.type === "shell") {
    const r = d.risk.toLowerCase();
    if (r === "critical") return "critical";
    if (r === "high") return "high";
    if (r === "medium") return "medium";
    if (r === "low") return "low";
    return "medium";
  }
  if (d.type === "mcp") return "medium";
  if (d.type === "write") {
    if (d.operation === "delete") return "high";
    return "low";
  }
  return "medium";
}

interface RiskVisual {
  borderColor: string;
  borderStyle: "single" | "double" | "round" | "bold" | "singleDouble" | "doubleSingle" | "classic";
  label: string;
}

function riskVisual(level: ApprovalRiskLevel): RiskVisual {
  switch (level) {
    case "info":     return { borderColor: "#62A8FF", borderStyle: "round",  label: "Info" };
    case "low":      return { borderColor: "#5F5F5F", borderStyle: "single", label: "Low" };
    case "medium":   return { borderColor: "#E8B45E", borderStyle: "single", label: "Medium" };
    case "high":     return { borderColor: "#E8B45E", borderStyle: "double", label: "High" };
    case "critical": return { borderColor: "#FF5F87", borderStyle: "double", label: "Critical" };
  }
}

function short(v: string, max = 60): string {
  return v.length > max ? v.slice(0, max - 1) + "…" : v;
}

export function ApprovalCardV2({
  request,
  theme,
}: ApprovalCardV2Props): React.ReactElement {
  const { detail, enrichment } = request;
  const level = resolveRiskLevel(request);
  const vis = riskVisual(level);

  const title =
    detail.type === "shell" ? "Shell Approval"
    : detail.type === "mcp" ? "MCP Approval"
    : "Write Approval";

  const actionLine =
    enrichment?.actionSummary ??
    (detail.type === "shell"
      ? (detail.command.split(/\s+/)[0] ?? "shell")
      : detail.type === "mcp"
        ? detail.tool
        : detail.operation.toUpperCase());

  const accentColor = vis.borderColor;
  const hintColor = theme?.colors.info ?? "#62A8FF";
  const mutedColor = theme?.colors.textTertiary ?? "#5F5F5F";

  return (
    <Box
      flexDirection="column"
      borderStyle={vis.borderStyle}
      borderColor={accentColor}
      paddingX={2}
      paddingY={1}
      marginX={1}
    >
      {/* Header with risk level */}
      <Box>
        <Text bold color={accentColor}>⚠ {title}</Text>
        <Text color={mutedColor}> · </Text>
        <Text color={accentColor} bold>L{["info","low","medium","high","critical"].indexOf(level)+1}:{vis.label}</Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Action: </Text>
        <Text>{actionLine}</Text>
      </Box>

      {/* Shell details */}
      {detail.type === "shell" && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text bold>Command: </Text>
            <Text color={theme?.colors.fg ?? "#E7E7E7"}>{short(detail.command)}</Text>
          </Box>
          <Box>
            <Text bold>Scope: </Text>
            <Text color={accentColor}>
              {detail.scope === "host" ? "host" : "workspace"}
              {" · sandbox: "}{detail.sandbox}
            </Text>
          </Box>
          {enrichment?.sandboxUpgrade && (
            <Box>
              <Text bold>Sandbox delta: </Text>
              <Text color={hintColor}>
                {enrichment.sandboxUpgrade.from} → {enrichment.sandboxUpgrade.to}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* MCP details */}
      {detail.type === "mcp" && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text bold>Server/tool: </Text>
            <Text>{detail.server} / {detail.tool}</Text>
          </Box>
          {detail.dataClass && (
            <Box>
              <Text bold>Data class: </Text>
              <Text color={accentColor}>{detail.dataClass.toUpperCase()}</Text>
            </Box>
          )}
          {detail.url && (
            <Box>
              <Text bold>Endpoint: </Text>
              <Text dimColor>{short(detail.url, 48)}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Write details */}
      {detail.type === "write" && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text bold>Path: </Text>
            <Text>{short(detail.path)}</Text>
          </Box>
          <Box>
            <Text bold>Operation: </Text>
            <Text color={accentColor}>{detail.operation}</Text>
          </Box>
          {detail.preview && (
            <Box marginTop={1}>
              <Text dimColor>{short(detail.preview, 200)}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Targets */}
      {(enrichment?.targetPaths?.length ?? 0) > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Targets:</Text>
          {enrichment!.targetPaths!.slice(0, 6).map((p) => (
            <Text key={p} dimColor> · {short(p, 50)}</Text>
          ))}
          {(enrichment!.targetPaths!.length ?? 0) > 6 && (
            <Text dimColor> … +{enrichment!.targetPaths!.length - 6} more</Text>
          )}
        </Box>
      )}

      {/* Policy rationale */}
      {enrichment?.matchedRules?.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={hintColor}>Policy rationale:</Text>
          {enrichment.matchedRules.map((rule) => (
            <Text key={rule} dimColor> — {rule}</Text>
          ))}
        </Box>
      ) : enrichment?.sandboxUpgrade ? (
        <Box marginTop={1}>
          <Text dimColor>Policy: escalation per sandbox ladder.</Text>
        </Box>
      ) : null}

      {/* Action bar — varies by risk level */}
      <Box marginTop={1} flexWrap="wrap">
        {level === "critical" ? (
          <Box flexDirection="column" width="100%">
            <Text color="#FF5F87" bold>⚠ CRITICAL: This action is irreversible.</Text>
            <Text>Type "yes" to confirm, or "n" to reject:</Text>
          </Box>
        ) : level === "high" ? (
          <Box flexDirection="column" width="100%">
            <Text>Type "yes" to confirm, or "n" to reject:</Text>
          </Box>
        ) : (
          <>
            <KeyHint k="y" label="once" color={hintColor} />
            <KeyHint k="a" label="session" color={hintColor} />
            <KeyHint k="w" label="workspace" color={hintColor} />
            <KeyHint k="n" label="deny" color={hintColor} />
            <Text color={mutedColor}>| </Text>
            <KeyHint k="v" label="details" color={mutedColor} />
          </>
        )}
      </Box>
    </Box>
  );
}
