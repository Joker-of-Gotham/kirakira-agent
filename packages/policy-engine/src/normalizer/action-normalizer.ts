import { canonicalizePath } from "./path-canonicalizer.js";
import { normalizeShellCommand, type ShellNormalizerResult } from "./shell-normalizer.js";
import type { McpNormalizerResult } from "./mcp-normalizer.js";
import { normalizeMcpAction } from "./mcp-normalizer.js";

export interface RawAction {
  kind: string;
  toolType: string;
  toolName: string;
  operation: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  workspaceRoot: string;
}

export interface NormalizerResult {
  command_ast_hash?: string;
  command_base?: string;
  flags: string[];
  subcommands: string[];
  write_paths: string[];
  read_paths: string[];
  network?: { required: boolean; domains: string[]; protocol?: string };
  destructive: boolean;
  interpreter_handoff: boolean;
  pipeline_depth: number;
  redirection_targets: string[];
  /** When true, PEP should deny without consulting the PDP (local policy violation). */
  blocked?: boolean;
  /** Human-readable cause when {@link blocked} is true. */
  block_reason?: string;
}

function safeDefaults(): NormalizerResult {
  return {
    flags: [],
    subcommands: [],
    write_paths: [],
    read_paths: [],
    destructive: false,
    interpreter_handoff: false,
    pipeline_depth: 0,
    redirection_targets: [],
  };
}

function fromShell(shell: ShellNormalizerResult, workspaceRoot: string): NormalizerResult {
  const networkRequired = shell.networkDomains.length > 0;
  const write_paths = [...new Set(shell.writePaths.map((p) => canonicalizePath(p, workspaceRoot)))];
  const read_paths = [...new Set(shell.readPaths.map((p) => canonicalizePath(p, workspaceRoot)))];
  return {
    command_base: shell.commandBase.length > 0 ? shell.commandBase : undefined,
    flags: shell.flags,
    subcommands: shell.subcommands,
    write_paths,
    read_paths,
    ...(networkRequired
      ? {
          network: {
            required: true,
            domains: shell.networkDomains,
            ...(shell.networkProtocol !== undefined
              ? { protocol: shell.networkProtocol }
              : {}),
          },
        }
      : {}),
    destructive: shell.destructive,
    interpreter_handoff: shell.interpreterHandoff,
    pipeline_depth: shell.pipelineDepth,
    redirection_targets: shell.redirectionTargets,
  };
}

function fromMcp(raw: RawAction, out: McpNormalizerResult): NormalizerResult {
  const wr = canonicalizePath(".", raw.workspaceRoot);
  return {
    command_base: raw.toolName,
    flags: [],
    subcommands: [raw.operation?.length ? raw.operation : raw.toolName, out.resourceType].filter(
      (x, i, a) => a.indexOf(x) === i,
    ),
    write_paths: out.sideEffect ? [wr] : [],
    read_paths: [],
    network: undefined,
    destructive: out.destructive,
    interpreter_handoff: false,
    pipeline_depth: 0,
    redirection_targets: [],
  };
}

function normalizeFilePaths(raw: RawAction): NormalizerResult {
  const ws = raw.workspaceRoot;
  const op = `${raw.operation} ${raw.kind}`.toLowerCase();
  const isWriteLike =
    /write|mkdir|unlink|rename|chmod|truncate|touch|patch|overwrite|save|upload/.test(op);
  const paths = [...(raw.args ?? []), raw.command].filter(Boolean) as string[];

  const resolved = [...new Set(paths.map((p) => canonicalizePath(p, ws)))];
  let write_paths: string[] = [];
  let read_paths: string[] = [];

  if (isWriteLike) write_paths = resolved;
  else read_paths = resolved;

  return {
    command_base: raw.toolName,
    flags: [],
    subcommands: [raw.operation],
    write_paths,
    read_paths,
    destructive: /delete|unlink|rm\b|chmod|chown|overwrite/.test(op),
    interpreter_handoff: false,
    pipeline_depth: 0,
    redirection_targets: [],
  };
}

function normalizeModel(raw: RawAction): NormalizerResult {
  const subcommands = [...(raw.args ?? []).filter((a) => !a.startsWith("-"))];
  const flags = [...(raw.args ?? []).filter((a) => a.startsWith("-"))];
  return {
    command_base: raw.toolName,
    flags,
    subcommands:
      raw.operation?.length && !subcommands.includes(raw.operation)
        ? [raw.operation, ...subcommands]
        : subcommands,
    write_paths: [],
    read_paths: [],
    destructive: false,
    interpreter_handoff: false,
    pipeline_depth: 0,
    redirection_targets: [],
  };
}

function normalizeRegistry(raw: RawAction): NormalizerResult {
  const args = raw.args ?? [];
  const pkgTok = args.find((a) => !a.startsWith("-")) ?? raw.operation;
  return {
    command_base: raw.toolName?.length ? raw.toolName : "registry",
    flags: [...new Set(args.filter((a) => a.startsWith("-")))],
    subcommands: pkgTok ? [pkgTok] : [],
    write_paths:
      /\b(?:install|add|upgrade|publish|unlink|remove)\b/i.test(
        `${raw.operation} ${raw.toolName}`,
      )
        ? [canonicalizePath(".", raw.workspaceRoot)]
        : [],
    read_paths: [],
    destructive: /\b(remove|unlink|purge|prune|publish)\b/i.test(`${raw.operation} ${raw.kind}`),
    interpreter_handoff: false,
    pipeline_depth: 0,
    redirection_targets: [],
    network:
      /\b(?:publish|install|add)\b/i.test(`${raw.operation} ${args.join(" ")}`)
        ? { required: true, domains: [] }
        : undefined,
  };
}

export function normalizeAction(raw: RawAction): NormalizerResult {
  switch (raw.toolType) {
    case "shell": {
      const cmd = raw.command ?? raw.args?.join(" ") ?? "";
      const shellOut = normalizeShellCommand(cmd, raw.workspaceRoot);
      return fromShell(shellOut, raw.workspaceRoot);
    }
    case "mcp":
      return fromMcp(
        raw,
        normalizeMcpAction({
          serverName: raw.operation?.length ? raw.operation : `${raw.kind}.mcp`,
          toolName: raw.toolName,
          serverTrustTier: raw.env?.KIRAKIRA_MCP_TRUST ?? raw.env?.KIRAKIRA_TRUST_TIER,
        }),
      );
    case "file":
      return normalizeFilePaths(raw);
    case "model":
      return normalizeModel(raw);
    case "registry":
      return normalizeRegistry(raw);
    default:
      return safeDefaults();
  }
}
