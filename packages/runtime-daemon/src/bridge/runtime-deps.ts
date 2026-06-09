import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  BudgetTracker,
  ContextAssembler,
  createEphemeralDelegateRunner,
  HistoryCompressor,
  ModelClient,
  SkillInjector,
  ToolExecutor,
  ToolRegistry,
  ToolSearchEngine,
  WorkspaceExecutor,
  type DelegateRunner,
  type GatewayClientLike,
  type RuntimeCapabilityScope,
  type RuntimeDeps,
  type SkillRegistration,
  type SubagentRuntimePolicy,
  type ToolSchema,
  type Workspace,
} from "@kirakira/agent-runtime";
import {
  McpClientManager,
  parseMcpConfigJson,
} from "@kirakira/mcp-adapter";
import {
  DisabledAuditWriter,
  EmbeddedPdp,
  McpPep,
  ObligationExecutor,
  type PepContext,
} from "@kirakira/policy-engine";
import { discoverSkills } from "@kirakira/skill-runtime";

export interface DaemonDelegateRuntimeOptions {
  workspaceRoot: string;
  eventWriter: RuntimeDeps["eventWriter"];
  mcpConfigPath?: string;
  mcpManager?: McpClientManager;
  modelGateway?: GatewayClientLike;
  policyBundlePath?: string;
  policy?: SubagentRuntimePolicy;
  allowNestedDelegation?: boolean;
}

export interface DaemonDelegateRuntime {
  delegateRunner: DelegateRunner;
  close(): Promise<void>;
}

interface RuntimeDepsInput {
  runId: string;
  traceId?: string;
  capabilityScope?: RuntimeCapabilityScope;
}

interface RuntimeDepsContext {
  workspaceRoot: string;
  eventWriter: RuntimeDeps["eventWriter"];
  modelClient: ModelClient;
  mcpManager: McpClientManager;
  mcpPep: McpPep;
  workspace: Workspace;
  skills: SkillRegistration[];
  discoveredTools: ToolSchema[];
}

function resolveMcpConfigPath(workspaceRoot: string, configPath?: string): string {
  return path.isAbsolute(configPath ?? "")
    ? configPath!
    : path.join(workspaceRoot, configPath ?? ".mcp.json");
}

function registerMcpConfig(
  manager: McpClientManager,
  workspaceRoot: string,
  configPath?: string,
): void {
  const resolved = resolveMcpConfigPath(workspaceRoot, configPath);
  if (!existsSync(resolved)) return;
  try {
    manager.registerMany(parseMcpConfigJson(readFileSync(resolved, "utf8")));
  } catch {
    // Invalid or partial MCP config should not prevent the daemon kernel from starting.
  }
}

async function discoverRuntimeSkills(workspaceRoot: string): Promise<SkillRegistration[]> {
  try {
    const skills = await discoverSkills(workspaceRoot);
    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      version: skill.version ?? "0.0.0",
      path: skill.path,
    }));
  } catch {
    return [];
  }
}

async function discoverRuntimeTools(manager: McpClientManager): Promise<ToolSchema[]> {
  const registry = new ToolRegistry();
  return registry.discover(manager, manager.listServers());
}

function createPepContext(
  workspaceRoot: string,
  input: RuntimeDepsInput,
): PepContext {
  return {
    sessionId: input.runId,
    traceId: input.traceId ?? input.runId,
    userId: process.env.USERNAME ?? process.env.USER ?? "local-user",
    workspaceRoot,
    interactive: false,
    roles: [],
  };
}

function createToolRegistry(
  discoveredTools: readonly ToolSchema[],
  capabilityScope: RuntimeCapabilityScope | undefined,
): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of discoveredTools) {
    registry.register(tool);
  }
  for (const toolName of capabilityScope?.toolNames ?? []) {
    if (registry.get(toolName) !== undefined) continue;
    registry.register({
      name: toolName,
      description: `Delegated runtime tool: ${toolName}`,
      inputSchema: { type: "object", properties: {} },
    });
  }
  return registry;
}

function createRuntimeDeps(
  context: RuntimeDepsContext,
  input: RuntimeDepsInput,
): RuntimeDeps {
  const budget = new BudgetTracker();
  const skillInjector = new SkillInjector(context.skills);
  const capabilityScope = input.capabilityScope;
  const registry = createToolRegistry(context.discoveredTools, capabilityScope);
  return {
    modelClient: context.modelClient,
    toolExecutor: new ToolExecutor(context.mcpPep, context.mcpManager, {
      pepContext: () => createPepContext(context.workspaceRoot, input),
      capabilityScope,
      onEvent: context.eventWriter.emit,
    }),
    skillInjector,
    contextAssembler: new ContextAssembler(
      new ToolSearchEngine(),
      skillInjector,
      new HistoryCompressor(budget, context.modelClient),
      budget,
      registry,
      { toolCapabilityQuery: "available delegated runtime tools" },
    ),
    workspaceExecutor: new WorkspaceExecutor(context.workspaceRoot),
    eventWriter: context.eventWriter,
    workspace: context.workspace,
  };
}

export async function createDaemonDelegateRuntime(
  options: DaemonDelegateRuntimeOptions,
): Promise<DaemonDelegateRuntime> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const mcpManager = options.mcpManager ?? new McpClientManager();
  const ownsMcpManager = options.mcpManager === undefined;
  registerMcpConfig(mcpManager, workspaceRoot, options.mcpConfigPath);

  const pdp = new EmbeddedPdp(options.policyBundlePath ?? path.join(workspaceRoot, "policies"));
  const mcpPep = new McpPep(
    pdp,
    new ObligationExecutor(),
    new DisabledAuditWriter(),
  );
  const modelClient = new ModelClient(options.modelGateway);
  const context: RuntimeDepsContext = {
    workspaceRoot,
    eventWriter: options.eventWriter,
    modelClient,
    mcpManager,
    mcpPep,
    workspace: {
      id: "daemon-workspace",
      rootPath: workspaceRoot,
      sandboxProfile: "daemon",
      artifacts: new Map(),
    },
    skills: await discoverRuntimeSkills(workspaceRoot),
    discoveredTools: await discoverRuntimeTools(mcpManager),
  };

  const baseDeps = createRuntimeDeps(context, {
    runId: "daemon",
    traceId: "daemon",
  });
  const delegateRunner = createEphemeralDelegateRunner(baseDeps, {
    policy: options.policy,
    allowNestedDelegation: options.allowNestedDelegation ?? false,
    forkDeps(_deps, capabilityScope, request) {
      return createRuntimeDeps(context, {
        runId: request.runId,
        traceId: request.traceId ?? request.subagentId,
        capabilityScope,
      });
    },
  });

  return {
    delegateRunner,
    async close() {
      if (ownsMcpManager) {
        await mcpManager.stopAll();
      }
      await pdp.close();
    },
  };
}
