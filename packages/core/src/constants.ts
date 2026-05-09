/** ID prefixes per entity type */
export const ID_PREFIX = {
  session: "ses_",
  trace: "trc_",
  request: "req_",
  approval: "apr_",
  span: "spn_",
  decision: "dec_",
  auditEvent: "evt_",
  auditSegment: "seg_",
} as const;

/** Standard directory paths */
export const PATHS = {
  userHome: ".kirakira",
  workspaceConfig: "agent.toml",
  workspacePolicy: "policy.yaml",
  workspacePrivate: ".kirakira/local.toml",
  workspaceLock: "kirakira.lock",
  mcpConfig: ".mcp.json",

  userConfig: "config.toml",
  userSessions: "sessions",
  userTraces: "traces",
  userSkills: "skills",
  userPlugins: "plugins",
  userCache: "cache",
  userCacheBlobs: "cache/blobs/sha256",
  userCacheManifests: "cache/manifests",
  userCacheIndex: "cache/index.sqlite",
  userRegistryAuth: "registry/auth.json",
  userRegistryTrust: "registry/trust.json",

  systemSkills: "/etc/kirakira/skills",
} as const;

/** Skill discovery directories in priority order */
export const SKILL_DISCOVERY_DIRS = [
  ".kirakira/skills",
  ".claude/skills",
  ".agents/skills",
  ".cursor/skills",
  ".cursor/commands",
] as const;

/** Supported MCP transport kinds */
export const MCP_TRANSPORTS = ["stdio", "http", "sse_legacy"] as const;

/** Standard OTel span names emitted by the CLI layer */
export const SPAN_NAMES = [
  "session.start",
  "prompt.submit",
  "attachment.resolve",
  "skill.select",
  "mcp.connect",
  "mcp.invoke",
  "shell.exec",
  "approval.wait",
  "approval.decision",
  "output.emit",
  "policy.evaluate",
  "approval.request",
  "sandbox.exec",
  "audit.append",
  "gen_ai.chat",
  "mcp.tool_call",
  "skill.script",
  "file.mutate",
  "network.http",
  "cli.command",
  "agent.run",
] as const;

/** JSONL output event types */
export const OUTPUT_EVENTS = [
  "session.start",
  "session.finish",
  "attachment.resolved",
  "skill.activated",
  "mcp.invoke",
  "approval.requested",
  "approval.decided",
  "shell.executed",
  "output.artifact",
  "error",
] as const;

/** Config layer load order (lowest to highest priority) */
export const CONFIG_LAYER_ORDER = [
  "system",
  "user",
  "repo",
  "workspace",
] as const;

/** System-level config path */
export const SYSTEM_CONFIG_PATH = "/etc/kirakira/agent.toml" as const;

/** Schema versions for forward-compat */
export const SCHEMA_VERSIONS = {
  agentToml: 1,
  policyYaml: 1,
  lockFile: 1,
  skillManifest: 1,
  mcpManifest: 1,
  registryManifest: 1,
  policyInput: 1,
  policyDecision: 1,
  auditEvent: 1,
  auditCheckpoint: 1,
} as const;

/** Audit ledger storage paths */
export const AUDIT_PATHS = {
  auditDir: "audit",
  ledgerDir: "audit/ledger",
  checkpointDir: "audit/checkpoints",
  keysDir: "audit/keys",
  indexFile: "audit/index.sqlite",
} as const;
