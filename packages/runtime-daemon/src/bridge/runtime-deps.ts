import type { ResolvedConfig } from "@kirakira/core";

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
  type AgentMcpToolGateway,
  type DelegateRunner,
  type GatewayClientLike,
  type McpTraceContextCarrier,
  type RuntimeCapabilityScope,
  type RuntimeDeps,
  type SkillRegistration,
  type SubagentRuntimePolicy,
  type ToolSchema,
  type Workspace,
} from "@kirakira/agent-runtime";
import type { McpClientManager } from "@kirakira/mcp-adapter";
import {
  DisabledAuditWriter,
  type PepContext,
} from "@kirakira/policy-engine";
import type { McpPep } from "@kirakira/policy-engine";
import { discoverSkills } from "@kirakira/skill-runtime";
import { createDaemonAgentMcpToolGateway } from "./agent-mcp-tool-gateway.js";
import { DaemonMcpRuntime } from "./mcp-runtime.js";
import { createDaemonMcpDependencies } from "./mcp-runtime-deps.js";

export interface DaemonDelegateRuntimeOptions {
  workspaceRoot: string;
  eventWriter: RuntimeDeps["eventWriter"];
  mcpConfigPath?: string;
  resolvedConfig?: Pick<ResolvedConfig, "runtimeState">;
  runtimeProfileName?: string;
  mcpManager?: McpClientManager;
  mcpPep?: McpPep;
  modelGateway?: GatewayClientLike;
  policyBundlePath?: string;
  policy?: SubagentRuntimePolicy;
  allowNestedDelegation?: boolean;
  traceContext?: McpTraceContextCarrier | (() => McpTraceContextCarrier | undefined);
}

export interface DaemonDelegateRuntime {
  delegateRunner: DelegateRunner;
  close(): Promise<void>;
}

interface RuntimeDepsInput {
  runId: string;
  traceId?: string;
  subagentId?: string;
  role?: string;
  requestedLane?: string;
  capabilityScope?: RuntimeCapabilityScope;
  traceContext?: McpTraceContextCarrier;
}

interface RuntimeDepsContext {
  workspaceRoot: string;
  eventWriter: RuntimeDeps["eventWriter"];
  modelClient: ModelClient;
  mcpToolGateway: AgentMcpToolGateway;
  runtimeProfileName?: string;
  traceContext?: McpTraceContextCarrier | (() => McpTraceContextCarrier | undefined);
  workspace: Workspace;
  skills: SkillRegistration[];
  discoveredTools: ToolSchema[];
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
    ...(input.subagentId !== undefined || input.role !== undefined || input.requestedLane !== undefined
      ? {
          agent: {
            ...(input.subagentId !== undefined ? { subagentId: input.subagentId } : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.requestedLane !== undefined
              ? { lane: input.requestedLane, requestedLane: input.requestedLane }
              : {}),
          },
        }
      : {}),
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
    toolExecutor: new ToolExecutor(context.mcpToolGateway, {
      pepContext: () => createPepContext(context.workspaceRoot, input),
      capabilityScope,
      ...(context.runtimeProfileName !== undefined
        ? { runtimeProfileName: context.runtimeProfileName }
        : {}),
      traceContext: input.traceContext ?? context.traceContext,
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
  const deps = createDaemonMcpDependencies({
    workspaceRoot: options.workspaceRoot,
    ...(options.mcpConfigPath !== undefined ? { mcpConfigPath: options.mcpConfigPath } : {}),
    ...(options.resolvedConfig !== undefined ? { resolvedConfig: options.resolvedConfig } : {}),
    ...(options.runtimeProfileName !== undefined
      ? { runtimeProfileName: options.runtimeProfileName }
      : {}),
    ...(options.policyBundlePath !== undefined ? { policyBundlePath: options.policyBundlePath } : {}),
    ...(options.mcpManager !== undefined ? { mcpManager: options.mcpManager } : {}),
    ...(options.mcpPep !== undefined ? { mcpPep: options.mcpPep } : {}),
    auditWriter: new DisabledAuditWriter(),
  });
  const workspaceRoot = deps.workspaceRoot;
  const mcpManager = deps.mcpManager;
  const mcpPep = deps.mcpPep;
  const mcpRuntime = new DaemonMcpRuntime({
    workspaceRoot,
    ...(options.mcpConfigPath !== undefined ? { mcpConfigPath: options.mcpConfigPath } : {}),
    ...(options.resolvedConfig !== undefined ? { resolvedConfig: options.resolvedConfig } : {}),
    ...(options.runtimeProfileName !== undefined
      ? { runtimeProfileName: options.runtimeProfileName }
      : {}),
    ...(options.policyBundlePath !== undefined ? { policyBundlePath: options.policyBundlePath } : {}),
    mcpManager,
    mcpPep,
    mcpAuditBridge: deps.mcpAuditBridge ?? null,
  });
  const mcpToolGateway = createDaemonAgentMcpToolGateway(mcpRuntime);
  const modelClient = new ModelClient(options.modelGateway);
  const context: RuntimeDepsContext = {
    workspaceRoot,
    eventWriter: options.eventWriter,
    modelClient,
    mcpToolGateway,
    ...(options.runtimeProfileName !== undefined
      ? { runtimeProfileName: options.runtimeProfileName }
      : {}),
    ...(options.traceContext !== undefined ? { traceContext: options.traceContext } : {}),
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
        subagentId: request.subagentId,
        role: request.role,
        requestedLane: request.requestedLane,
        capabilityScope,
      });
    },
  });

  return {
    delegateRunner,
    async close() {
      await mcpRuntime.close();
      await deps.close();
    },
  };
}
