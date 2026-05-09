# Copilot compatibility

**Adapter:** `packages/compat/src/adapters/copilot.ts`.

## Detection & scan

`scanCopilot()` (synchronous) collects VS Code–style MCP config references such as **`mcp-config.json`** paths when present (see detector wiring for `copilot` in `detector.ts`).

## Normalization

`readCopilotMcpConfig` feeds the shared manifest builder in `normalizer.ts`; MCP entries ultimately must satisfy `mcpConfigFileSchema` / manifest types from `@kirakira/core`.

## Security

Imported Copilot MCP servers undergo **`scanImportedConfig`** in `security-scanner.ts` (rules for remote endpoints, secret leakage).

## Policy

Workspace `policy.yaml` may deny unknown Copilot servers until enterprise allowlisting is configured (`mcp.approvedServers`).
