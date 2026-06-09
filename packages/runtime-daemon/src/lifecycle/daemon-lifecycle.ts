import { EventReader, RunStateProjector } from "@kirakira/event-store";
import {
  runtimeDaemonHealth,
  runtimeManifest,
  type ControlMessage,
  type EventFilter,
  type RunEvent,
  type RuntimeCapabilityOverrides,
  type RuntimeDaemonHealth,
  type RuntimeManifest,
  type RuntimeMcpListResult,
  type RuntimeMcpManifest,
  type RuntimeOrchestrationManifest,
  type RuntimeMcpToolCallResult,
} from "@kirakira/runtime-contracts";
import { ulid } from "ulid";
import { GatewayBridge, type GatewayBridgeOptions } from "../bridge/gateway-bridge.js";
import { KernelBridge, type KernelBridgeOptions } from "../bridge/kernel-bridge.js";
import {
  DaemonMcpRuntime,
  type DaemonMcpRuntimeOptions,
} from "../bridge/mcp-runtime.js";
import { shouldCreateDaemonMemoryDependencies } from "../bridge/memory-runtime-deps.js";
import { RuntimeBridge } from "../bridge/runtime-bridge.js";
import { resolveDaemonSocketPath } from "../ipc/socket-path.js";
import { eventMatchesSubscription } from "../server/event-utils.js";
import type { ClientMessage, ServerMessage } from "../server/protocol.js";
import { SessionManager, type Session } from "../server/session-manager.js";
import {
  BrowserGatewayServer,
  type BrowserGatewayConfig,
  type BrowserGatewayListenInfo,
} from "../server/browser-gateway-server.js";
import { UdsServer } from "../server/uds-server.js";
import { buildRunStateSnapshot } from "../snapshot.js";
import { ProcessManager } from "./process-manager.js";
import {
  RuntimeArtifactContentError,
  readRuntimeArtifactContent,
} from "../server/artifact-content.js";
import { activeRuntimeProfile } from "../bridge/runtime-profile.js";

export interface DaemonConfig {
  socketPath?: string;
  eventStorePath?: string;
  gateway?: GatewayBridgeOptions;
  kernel?: KernelBridgeOptions;
  mcpRuntime?: Omit<
    DaemonMcpRuntimeOptions,
    "workspaceRoot" | "mcpConfigPath" | "resolvedConfig" | "runtimeProfileName"
  >;
  browserGateway?: BrowserGatewayConfig;
  shutdownTimeoutMs?: number;
}

export type HealthStatus = RuntimeDaemonHealth;

function hasDeepResearchConfig(options: KernelBridgeOptions | undefined): boolean {
  return Boolean(
    options?.deepResearch ||
      options?.kernelOptions?.deepResearch ||
      options?.resolvedConfig?.agentToml.deep_research?.enabled,
  );
}

function hasDeepResearchMemory(options: KernelBridgeOptions | undefined): boolean {
  if (!options) return false;
  return Boolean(
    options.deepResearch?.memory ||
      shouldCreateDaemonMemoryDependencies({
        workspaceRoot:
          options.workspaceRoot ?? process.env.KIRAKIRA_WORKSPACE_ROOT ?? process.cwd(),
        env: options.memory?.env,
        resolvedConfig: options.resolvedConfig,
        runtimeProfileName: options.runtimeProfileName,
        service: options.memory?.service,
        serviceFactory: options.memory?.serviceFactory,
      }),
  );
}

function hasMcpRuntime(options: KernelBridgeOptions | undefined): boolean {
  return Boolean(
    options?.mcpConfigPath ||
      options?.resolvedConfig?.runtimeState?.profiles.some(
        (profile) => (profile.mcp_servers?.length ?? 0) > 0,
      ),
  );
}

function runtimeMcpManifest(
  options: KernelBridgeOptions | undefined,
): RuntimeMcpManifest | undefined {
  const runtimeState = options?.resolvedConfig?.runtimeState;
  const profile = activeRuntimeProfile(
    options?.resolvedConfig,
    options?.runtimeProfileName,
  );
  const servers = profile?.mcp_servers ?? [];
  const catalog = runtimeState?.mcp_catalog;
  if (servers.length === 0 && !catalog) return undefined;
  return {
    ...(profile?.name ? { profileName: profile.name } : {}),
    ...(profile?.mcp_server_groups ? { serverGroups: profile.mcp_server_groups } : {}),
    servers: servers.map((server) => ({
      name: server.name,
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env ? { envKeys: Object.keys(server.env).sort() } : {}),
    })),
    ...(catalog
      ? {
          catalog: {
            ...(catalog.default_server_groups
              ? { defaultServerGroups: catalog.default_server_groups }
              : {}),
            ...(catalog.groups ? { groups: catalog.groups } : {}),
            ...(catalog.servers ? { servers: catalog.servers } : {}),
          },
        }
      : {}),
  };
}

function runtimeOrchestrationManifest(
  options: KernelBridgeOptions | undefined,
): RuntimeOrchestrationManifest | undefined {
  const profile = activeRuntimeProfile(
    options?.resolvedConfig,
    options?.runtimeProfileName,
  );
  const orchestration = profile?.orchestration;
  if (!profile || !orchestration) return undefined;
  return {
    profileName: profile.name,
    ...(orchestration.handoff_mode ? { handoffMode: orchestration.handoff_mode } : {}),
    ...(orchestration.default_role ? { defaultRole: orchestration.default_role } : {}),
    ...(orchestration.lanes ? { lanes: orchestration.lanes } : {}),
    ...(orchestration.roles
      ? {
          roles: orchestration.roles.map((role) => ({
            id: role.id,
            ...(role.description ? { description: role.description } : {}),
            ...(role.lane ? { lane: role.lane } : {}),
            ...(role.model ? { model: role.model } : {}),
            ...(role.max_turns ? { maxTurns: role.max_turns } : {}),
            ...(role.context ? { context: role.context } : {}),
            ...(role.tool_scope ? { toolScope: role.tool_scope } : {}),
            ...(role.skill_scope ? { skillScope: role.skill_scope } : {}),
            ...(role.mcp_servers ? { mcpServers: role.mcp_servers } : {}),
            ...(role.permissions ? { permissionLabels: role.permissions } : {}),
          })),
        }
      : {}),
    ...(orchestration.handoffs
      ? {
          handoffs: orchestration.handoffs.map((handoff) => ({
            from: handoff.from,
            to: handoff.to,
            ...(handoff.mode ? { mode: handoff.mode } : {}),
            ...(handoff.input_filter ? { inputFilter: handoff.input_filter } : {}),
            ...(handoff.approval_required !== undefined
              ? { approvalRequired: handoff.approval_required }
              : {}),
            ...(handoff.conditions ? { conditions: handoff.conditions } : {}),
          })),
        }
      : {}),
  };
}

function daemonCapabilityOverrides(
  options: KernelBridgeOptions | undefined,
): RuntimeCapabilityOverrides {
  return {
    subagents: {
      state: options?.enableDaemonSubagents === false ? "disabled" : "enabled",
    },
    deep_research: {
      state: hasDeepResearchConfig(options) ? "enabled" : "available",
    },
    memory: {
      state: hasDeepResearchMemory(options) ? "enabled" : "available",
    },
    artifacts: {
      state: "enabled",
    },
    mcp: {
      state: hasMcpRuntime(options) ? "enabled" : "available",
    },
  };
}

function resultPreview(result: RuntimeMcpToolCallResult): string | undefined {
  const value = result.error ?? result.structuredContent ?? result.content;
  if (value === undefined) return undefined;
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = "[unserializable MCP result]";
  }
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
}

export class DaemonLifecycle {
  private readonly sessions = new SessionManager();
  private readonly subs = new Map<
    string,
    { clientId: string; runId?: string; filter?: EventFilter }
  >();
  private processes: ProcessManager | null = null;
  private gateway: GatewayBridge | null = null;
  private kernelBridge: KernelBridge | null = null;
  private runtime: RuntimeBridge | null = null;
  private uds: UdsServer | null = null;
  private browserGateway: BrowserGatewayServer | null = null;
  private browserGatewayInfo: BrowserGatewayListenInfo | null = null;
  private mcpRuntime: DaemonMcpRuntime | null = null;
  private unsubEvents: (() => void) | null = null;
  private _running = false;
  private socketPath = "";
  private eventStorePath = "";
  private workspaceRoot = "";
  private shutdownTimeoutMs = 30_000;
  private capabilities: RuntimeCapabilityOverrides = {};
  private mcpManifest: RuntimeMcpManifest | undefined;
  private orchestrationManifest: RuntimeOrchestrationManifest | undefined;

  async start(config: DaemonConfig): Promise<void> {
    if (this._running) {
      throw new Error("Daemon already running");
    }
    this.shutdownTimeoutMs = config.shutdownTimeoutMs ?? 30_000;
    this.socketPath = resolveDaemonSocketPath(config.socketPath);
    this.eventStorePath = config.eventStorePath ?? "";
    this.workspaceRoot =
      config.kernel?.workspaceRoot ??
      process.env.KIRAKIRA_WORKSPACE_ROOT ??
      process.cwd();
    this.capabilities = daemonCapabilityOverrides(config.kernel);
    this.mcpManifest = runtimeMcpManifest(config.kernel);
    this.orchestrationManifest = runtimeOrchestrationManifest(config.kernel);
    this.mcpRuntime = new DaemonMcpRuntime({
      ...(config.mcpRuntime ?? {}),
      workspaceRoot: this.workspaceRoot,
      mcpConfigPath: config.kernel?.mcpConfigPath,
      resolvedConfig: config.kernel?.resolvedConfig,
      runtimeProfileName: config.kernel?.runtimeProfileName,
    });
    this.processes = new ProcessManager();
    this.gateway = new GatewayBridge(this.processes, config.gateway);
    await this.gateway.start();
    this.kernelBridge = new KernelBridge(this.eventStorePath, config.kernel);
    await this.kernelBridge.create();
    this.runtime = new RuntimeBridge(this.kernelBridge.getKernel());
    this.unsubEvents = this.kernelBridge.onEvent((ev) => {
      this.dispatchEvent(ev);
    });
    const self = this;
    this.uds = new UdsServer({
      onConnect(clientId) {
        self.sessions.createSession(clientId);
      },
      onDisconnect(clientId) {
        self.closeClientSession(clientId);
      },
      async onMessage(clientId, message) {
        await self.handleClientMessage(clientId, message);
      },
    });
    await this.uds.start(this.socketPath);
    if (config.browserGateway?.enabled) {
      this.browserGateway = new BrowserGatewayServer({
        onConnect(clientId) {
          self.sessions.createSession(clientId);
        },
        onDisconnect(clientId) {
          self.closeClientSession(clientId);
        },
        async onMessage(clientId, message) {
          await self.handleClientMessage(clientId, message);
        },
        manifest() {
          return self.manifest();
        },
      });
      this.browserGatewayInfo = await this.browserGateway.start(config.browserGateway);
    }
    this._running = true;
  }

  getRuntimeBridge(): RuntimeBridge {
    if (!this.runtime) throw new Error("Daemon not started");
    return this.runtime;
  }

  getKernelBridge(): KernelBridge {
    if (!this.kernelBridge) throw new Error("Daemon not started");
    return this.kernelBridge;
  }

  private sessionForClient(clientId: string): Session | null {
    return this.sessions.findSessionByClient(clientId);
  }

  private closeClientSession(clientId: string): void {
    const s = this.sessions.findSessionByClient(clientId);
    if (!s) return;
    for (const sub of [...this.subs.entries()]) {
      const [subId, v] = sub;
      if (v.clientId === clientId) this.subs.delete(subId);
    }
    this.sessions.closeSession(s.id);
  }

  private sendToClient(clientId: string, message: ServerMessage): void {
    this.uds?.sendTo(clientId, message);
    this.browserGateway?.sendTo(clientId, message);
  }

  private dispatchEvent(ev: RunEvent): void {
    for (const [, sub] of this.subs) {
      if (eventMatchesSubscription(ev, sub.runId, sub.filter)) {
        this.sendToClient(sub.clientId, { type: "event", event: ev });
      }
    }
  }

  private async handleClientMessage(clientId: string, msg: ClientMessage): Promise<void> {
    const session = this.sessionForClient(clientId);
    if (!session) {
      return;
    }
    this.sessions.touch(session);
    switch (msg.type) {
      case "ping":
        this.sendToClient(clientId, {
          type: "pong",
          messageId: msg.messageId,
        });
        break;
      case "get_state": {
        const k = this.kernelBridge?.getKernel();
        if (!k) {
          this.sendToClient(clientId, {
            type: "error",
            code: "kernel_unavailable",
            message: "Kernel not ready",
            messageId: msg.messageId,
          });
          return;
        }
        const snap = buildRunStateSnapshot(k, msg.runId);
        if (!snap) {
          this.sendToClient(clientId, {
            type: "error",
            code: "unknown_run",
            message: `Run not found: ${msg.runId}`,
            messageId: msg.messageId,
          });
          return;
        }
        this.sendToClient(clientId, {
          type: "state_snapshot",
          state: snap,
        });
        this.sendToClient(clientId, {
          type: "ack",
          messageId: msg.messageId,
          result: snap,
        });
        break;
      }
      case "get_artifact":
        await this.handleGetArtifact(clientId, msg);
        break;
      case "mcp_call":
        await this.handleMcpCall(clientId, msg);
        break;
      case "mcp_list":
        await this.handleMcpList(clientId, msg);
        break;
      case "control":
        await this.handleControl(clientId, session, msg.message, msg.messageId);
        break;
      case "subscribe": {
        const subId = ulid();
        const reader = new EventReader(this.eventStorePath);
        let replayedThroughSeq: number | undefined;
        try {
          if (msg.runId !== undefined && msg.afterSeq !== undefined) {
            const events = reader.readSinceCheckpoint(msg.runId, msg.afterSeq);
            replayedThroughSeq = msg.afterSeq + events.length;
            for (const ev of events) {
              if (eventMatchesSubscription(ev, msg.runId, msg.filter)) {
                this.sendToClient(clientId, { type: "event", event: ev });
              }
            }
          }
        } finally {
          reader.close();
        }
        session.subscriptions.push({
          id: subId,
          runId: msg.runId,
          filter: msg.filter,
          createdAt: Date.now(),
        });
        this.subs.set(subId, {
          clientId,
          runId: msg.runId,
          filter: msg.filter,
        });
        this.sendToClient(clientId, {
          type: "subscribed",
          subscriptionId: subId,
          messageId: msg.messageId,
          replayedThroughSeq,
        });
        break;
      }
      case "unsubscribe": {
        const subscription = this.subs.get(msg.subscriptionId);
        if (!subscription || subscription.clientId !== clientId) {
          this.sendToClient(clientId, {
            type: "error",
            code: "unknown_subscription",
            message: `Subscription not found: ${msg.subscriptionId}`,
            messageId: msg.messageId,
          });
          break;
        }
        this.subs.delete(msg.subscriptionId);
        session.subscriptions = session.subscriptions.filter((s) => s.id !== msg.subscriptionId);
        this.sendToClient(clientId, {
          type: "ack",
          messageId: msg.messageId ?? ulid(),
        });
        break;
      }
    }
  }

  private sendRequestError(
    clientId: string,
    messageId: string,
    code: string,
    message: string,
    details?: unknown,
  ): void {
    this.sendToClient(clientId, {
      type: "error",
      code,
      message,
      messageId,
      ...(details !== undefined ? { details } : {}),
    });
  }

  private appendAndDispatchEvent(event: RunEvent): RunEvent {
    let stamped = event;
    try {
      stamped = this.kernelBridge?.getKernel().getWriter().append(event) ?? event;
    } catch {
      /* Event persistence must not break direct runtime requests. */
    }
    this.dispatchEvent(stamped);
    return stamped;
  }

  private async handleGetArtifact(
    clientId: string,
    msg: Extract<ClientMessage, { type: "get_artifact" }>,
  ): Promise<void> {
    const reader = new EventReader(this.eventStorePath);
    try {
      const events = reader.readAll(msg.runId);
      if (events.length === 0) {
        this.sendRequestError(
          clientId,
          msg.messageId,
          "unknown_run",
          `Run not found: ${msg.runId}`,
        );
        return;
      }
      const state = new RunStateProjector().project(events);
      const artifact = await readRuntimeArtifactContent({
        state,
        artifactId: msg.artifactId,
        fallbackWorkspaceRoot: this.workspaceRoot,
        maxBytes: msg.maxBytes,
      });
      this.sendToClient(clientId, { type: "artifact_content", artifact });
      this.sendToClient(clientId, {
        type: "ack",
        messageId: msg.messageId,
        result: artifact,
      });
    } catch (error) {
      if (error instanceof RuntimeArtifactContentError) {
        this.sendRequestError(
          clientId,
          msg.messageId,
          error.code,
          error.message,
          error.details,
        );
        return;
      }
      this.sendRequestError(
        clientId,
        msg.messageId,
        "artifact_unreadable",
        `Artifact content is not readable: ${msg.artifactId}`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      reader.close();
    }
  }

  private async handleMcpCall(
    clientId: string,
    msg: Extract<ClientMessage, { type: "mcp_call" }>,
  ): Promise<void> {
    const runtime = this.mcpRuntime;
    if (!runtime) {
      this.sendRequestError(
        clientId,
        msg.messageId,
        "mcp_unavailable",
        "MCP runtime is not available",
      );
      return;
    }
    const callId = ulid();
    if (msg.runId !== undefined) {
      this.appendAndDispatchEvent({
        id: ulid(),
        runId: msg.runId,
        timestamp: new Date().toISOString(),
        kind: "tool.call.started",
        payload: {
          callId,
          toolName: `${msg.server}:${msg.tool}`,
          toolId: `mcp.${msg.server}.${msg.tool}`,
          mcpServer: msg.server,
          server: msg.server,
          nativeTool: msg.tool,
          source: "runtime.mcp_call",
          ...(msg.arguments !== undefined ? { args: msg.arguments } : {}),
          ...(msg.traceId !== undefined ? { traceId: msg.traceId } : {}),
          ...(msg.subagentId !== undefined ? { subagentId: msg.subagentId } : {}),
          ...(msg.role !== undefined ? { role: msg.role } : {}),
          ...(msg.requestedLane !== undefined ? { requestedLane: msg.requestedLane } : {}),
        },
      });
    }
    try {
      const result = await runtime.callTool({
        server: msg.server,
        tool: msg.tool,
        ...(msg.arguments !== undefined ? { arguments: msg.arguments } : {}),
        ...(msg.runId !== undefined ? { runId: msg.runId } : {}),
        ...(msg.traceId !== undefined ? { traceId: msg.traceId } : {}),
        ...(msg.subagentId !== undefined ? { subagentId: msg.subagentId } : {}),
        ...(msg.role !== undefined ? { role: msg.role } : {}),
        ...(msg.requestedLane !== undefined ? { requestedLane: msg.requestedLane } : {}),
      });
      this.sendToClient(clientId, {
        type: "ack",
        messageId: msg.messageId,
        result,
      });
      if (msg.runId !== undefined) {
        const preview = resultPreview(result);
        this.appendAndDispatchEvent({
          id: ulid(),
          runId: msg.runId,
          timestamp: new Date().toISOString(),
          kind: result.success ? "tool.call.completed" : "tool.call.failed",
          payload: {
            callId,
            toolName: `${msg.server}:${msg.tool}`,
            toolId: `mcp.${msg.server}.${msg.tool}`,
            mcpServer: msg.server,
            server: msg.server,
            nativeTool: msg.tool,
            source: "runtime.mcp_call",
            success: result.success,
            isError: result.isError ?? false,
            latencyMs: result.latencyMs,
            policy: result.policy,
            ...(result.error !== undefined ? { error: result.error } : {}),
            ...(preview !== undefined ? { resultPreview: preview } : {}),
            ...(msg.traceId !== undefined ? { traceId: msg.traceId } : {}),
            ...(msg.subagentId !== undefined ? { subagentId: msg.subagentId } : {}),
            ...(msg.role !== undefined ? { role: msg.role } : {}),
            ...(msg.requestedLane !== undefined ? { requestedLane: msg.requestedLane } : {}),
          },
        });
      }
    } catch (error) {
      if (msg.runId !== undefined) {
        this.appendAndDispatchEvent({
          id: ulid(),
          runId: msg.runId,
          timestamp: new Date().toISOString(),
          kind: "tool.call.failed",
          payload: {
            callId,
            toolName: `${msg.server}:${msg.tool}`,
            toolId: `mcp.${msg.server}.${msg.tool}`,
            mcpServer: msg.server,
            server: msg.server,
            nativeTool: msg.tool,
            source: "runtime.mcp_call",
            error: error instanceof Error ? error.message : String(error),
            ...(msg.traceId !== undefined ? { traceId: msg.traceId } : {}),
            ...(msg.subagentId !== undefined ? { subagentId: msg.subagentId } : {}),
            ...(msg.role !== undefined ? { role: msg.role } : {}),
            ...(msg.requestedLane !== undefined ? { requestedLane: msg.requestedLane } : {}),
          },
        });
      }
      this.sendRequestError(
        clientId,
        msg.messageId,
        "mcp_call_failed",
        "MCP tool call failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleMcpList(
    clientId: string,
    msg: Extract<ClientMessage, { type: "mcp_list" }>,
  ): Promise<void> {
    const runtime = this.mcpRuntime;
    if (!runtime) {
      this.sendRequestError(
        clientId,
        msg.messageId,
        "mcp_unavailable",
        "MCP runtime is not available",
      );
      return;
    }
    try {
      const result: RuntimeMcpListResult = await runtime.listTools({
        ...(msg.server !== undefined ? { server: msg.server } : {}),
        ...(msg.includeTools !== undefined ? { includeTools: msg.includeTools } : {}),
        ...(msg.startServers !== undefined ? { startServers: msg.startServers } : {}),
      });
      this.sendToClient(clientId, {
        type: "ack",
        messageId: msg.messageId,
        result,
      });
    } catch (error) {
      this.sendRequestError(
        clientId,
        msg.messageId,
        "mcp_list_failed",
        "MCP tool discovery failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleControl(
    clientId: string,
    session: Session,
    message: ControlMessage,
    messageId?: string,
  ): Promise<void> {
    const mid = messageId ?? ulid();
    const kb = this.kernelBridge;
    if (!kb) {
      this.sendToClient(clientId, {
        type: "error",
        code: "kernel_unavailable",
        message: "Kernel not ready",
        messageId: mid,
      });
      return;
    }
    if (message.type === "submit") {
      const runId = await kb.submitRun(message.prompt, message.mode, message.options);
      if (!session.runIds.includes(runId)) session.runIds.push(runId);
      this.sendToClient(clientId, {
        type: "ack",
        messageId: mid,
        result: { runId },
      });
      return;
    }

    const op = (message as { type: string }).type;
    if (op === "inspect") {
      const runId = (message as { runId?: string }).runId;
      if (typeof runId !== "string") {
        this.sendToClient(clientId, {
          type: "error",
          code: "invalid_control",
          message: "inspect requires runId",
          messageId: mid,
        });
        return;
      }
      kb.forwardControl(message);
      const snap = buildRunStateSnapshot(kb.getKernel(), runId);
      if (!snap) {
        this.sendToClient(clientId, {
          type: "error",
          code: "unknown_run",
          message: `Run not found: ${runId}`,
          messageId: mid,
        });
        return;
      }
      this.sendToClient(clientId, { type: "ack", messageId: mid, result: snap });
      return;
    }

    kb.forwardControl(message);
    this.sendToClient(clientId, { type: "ack", messageId: mid });
  }

  isRunning(): boolean {
    return this._running;
  }

  async health(): Promise<HealthStatus> {
    const gw = this.gateway ? await this.gateway.isHealthy().catch(() => false) : false;
    const kernel = this.kernelBridge !== null;
    const socket = this._running && this.uds !== null;
    return runtimeDaemonHealth({
      gateway: gw,
      kernel,
      socket,
      socketPath: this.socketPath,
      capabilities: this.capabilities,
      mcp: this.mcpManifest,
      orchestration: this.orchestrationManifest,
      ...(this._running && this.browserGatewayInfo
        ? {
            browserGateway: {
              endpoint: this.browserGatewayInfo.endpoint,
              tokenRequired: this.browserGatewayInfo.tokenRequired,
            },
          }
        : {}),
    });
  }

  manifest(): RuntimeManifest {
    return runtimeManifest({
      socketPath: this.socketPath || undefined,
      capabilities: this.capabilities,
      mcp: this.mcpManifest,
      orchestration: this.orchestrationManifest,
      ...(this._running && this.browserGatewayInfo
        ? {
            browserGateway: {
              endpoint: this.browserGatewayInfo.endpoint,
              tokenRequired: this.browserGatewayInfo.tokenRequired,
            },
          }
        : {}),
    });
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    if (this.unsubEvents) {
      this.unsubEvents();
      this.unsubEvents = null;
    }
    const kb = this.kernelBridge;
    if (kb) {
      try {
        await Promise.race([
          kb.getKernel().waitForDrain(),
          new Promise<void>((resolve) => {
            setTimeout(resolve, this.shutdownTimeoutMs);
          }),
        ]);
      } catch {
        /* ignore */
      }
    }
    this.uds?.closeAllClients();
    await this.uds?.stop();
    this.uds = null;
    this.browserGateway?.closeAllClients();
    await this.browserGateway?.stop();
    this.browserGateway = null;
    this.browserGatewayInfo = null;
    await this.gateway?.stop();
    this.gateway = null;
    await this.mcpRuntime?.close();
    this.mcpRuntime = null;
    await this.kernelBridge?.destroy();
    this.kernelBridge = null;
    this.runtime = null;
    this.processes = null;
    this.subs.clear();
    this.capabilities = {};
    this.mcpManifest = undefined;
    this.orchestrationManifest = undefined;
  }
}
