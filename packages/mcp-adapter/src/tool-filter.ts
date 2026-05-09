import type { McpServerConfig, McpToolInfo } from "@kirakira/core";

/** Filter declared tools using per-server enable/disable lists. */
export function filterTools(
  tools: readonly McpToolInfo[],
  toolsConfig: McpServerConfig["tools"] | undefined,
): McpToolInfo[] {
  if (!toolsConfig) {
    return [...tools];
  }
  let out = [...tools];
  if (toolsConfig.enabled?.length) {
    const allow = new Set(toolsConfig.enabled);
    out = out.filter((t) => allow.has(t.name));
  }
  if (toolsConfig.disabled?.length) {
    const deny = new Set(toolsConfig.disabled);
    out = out.filter((t) => !deny.has(t.name));
  }
  return out;
}
