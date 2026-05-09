/**
 * MCP policy filter — domain allowlist/denylist enforcement,
 * tool allow/deny, output constraints, and read/write classification.
 *
 * Aligned with kirakira-agent-registry.md §MCP Gateway layer 4: policy filter.
 */

export interface McpPolicyConfig {
  allowedDomains?: string[];
  deniedDomains?: string[];
  approvedServers?: string[];
  deniedServers?: string[];
  allowRemoteHttp?: boolean;
  maxOutputTokens?: number;
  readonlyTools?: string[];
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkDomainPolicy(
  url: string,
  policy: McpPolicyConfig,
): PolicyCheckResult {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { allowed: false, reason: `Invalid URL: ${url}` };
  }

  if (policy.deniedDomains?.length) {
    for (const pattern of policy.deniedDomains) {
      if (matchDomain(hostname, pattern)) {
        return { allowed: false, reason: `Domain "${hostname}" is denied by policy` };
      }
    }
  }

  if (policy.allowedDomains?.length) {
    const matched = policy.allowedDomains.some((p) => matchDomain(hostname, p));
    if (!matched) {
      return {
        allowed: false,
        reason: `Domain "${hostname}" is not in the allowed list`,
      };
    }
  }

  return { allowed: true };
}

export function checkServerPolicy(
  serverName: string,
  policy: McpPolicyConfig,
): PolicyCheckResult {
  if (policy.deniedServers?.some((s) => s === serverName)) {
    return { allowed: false, reason: `Server "${serverName}" is denied by policy` };
  }

  if (
    policy.approvedServers?.length &&
    !policy.approvedServers.includes(serverName)
  ) {
    return {
      allowed: false,
      reason: `Server "${serverName}" is not approved by policy`,
    };
  }

  return { allowed: true };
}

export function checkRemoteHttpPolicy(
  url: string,
  policy: McpPolicyConfig,
): PolicyCheckResult {
  if (policy.allowRemoteHttp === false) {
    try {
      const parsed = new URL(url);
      const h = parsed.hostname;
      const isLocal = h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local");
      if (!isLocal) {
        return { allowed: false, reason: "Remote HTTP transport is denied by policy (allowRemoteHttp=false)" };
      }
    } catch {
      return { allowed: false, reason: `Invalid URL for remote HTTP check: ${url}` };
    }
  }
  return { allowed: true };
}

export function checkOutputTokens(
  outputTokenCount: number,
  policy: McpPolicyConfig,
): PolicyCheckResult {
  if (policy.maxOutputTokens !== undefined && outputTokenCount > policy.maxOutputTokens) {
    return { allowed: false, reason: `Output exceeds maxOutputTokens limit (${outputTokenCount} > ${policy.maxOutputTokens})` };
  }
  return { allowed: true };
}

export function isToolReadonly(
  toolName: string,
  policy: McpPolicyConfig,
): boolean {
  return policy.readonlyTools?.includes(toolName) ?? false;
}

function matchDomain(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern;
}
