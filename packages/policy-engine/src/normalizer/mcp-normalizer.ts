const DESTRUCTIVE_NAME =
  /(?:delete|remove|drop|destroy|write|create|update|modify|send|execute|run)/i;

export interface McpNormalizerInput {
  serverName: string;
  toolName: string;
  args?: Record<string, unknown>;
  serverTrustTier?: string;
  toolAnnotations?: { destructive?: boolean; readOnly?: boolean };
}

export interface McpNormalizerResult {
  resourceType: string;
  sideEffect: boolean;
  destructive: boolean;
  authMode?: string;
  trustTier: string;
}

function inferResourceType(toolName: string): string {
  const [head] = toolName.split(/[./]/u);
  return head && head.length > 0 ? head : "mcp";
}

export function normalizeMcpAction(input: McpNormalizerInput): McpNormalizerResult {
  const trustTier = input.serverTrustTier ?? "unknown";
  const ann = input.toolAnnotations;
  const readOnly = ann?.readOnly === true;
  const annDestructive = ann?.destructive === true;
  const nameHit = DESTRUCTIVE_NAME.test(input.toolName);
  const destructive = annDestructive || nameHit;
  const sideEffect = readOnly ? destructive : true;

  const authMode =
    trustTier === "privileged"
      ? "elevated"
      : trustTier === "standard"
        ? "standard"
        : trustTier === "restricted"
          ? "restricted"
          : undefined;

  return {
    resourceType: inferResourceType(input.toolName),
    sideEffect,
    destructive,
    ...(authMode !== undefined ? { authMode } : {}),
    trustTier,
  };
}
