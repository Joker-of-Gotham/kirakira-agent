import { EventReader } from "@kirakira/event-store";
import {
  runtimeDaemonHealth,
  type ControlMessage,
  type EventFilter,
  type RunEvent,
  type RuntimeDaemonHealth,
} from "@kirakira/runtime-contracts";
import { ulid } from "ulid";
import { GatewayBridge, type GatewayBridgeOptions } from "../bridge/gateway-bridge.js";
import { KernelBridge } from "../bridge/kernel-bridge.js";
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

export interface DaemonConfig {
  socketPath?: string;
  eventStorePath?: string;
  gateway?: GatewayBridgeOptions;
  browserGateway?: BrowserGatewayConfig;
  shutdownTimeoutMs?: number;
}

export type HealthStatus = RuntimeDaemonHealth;

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
  private unsubEvents: (() => void) | null = null;
  private _running = false;
  private socketPath = "";
  private eventStorePath = "";
  private shutdownTimeoutMs = 30_000;

  async start(config: DaemonConfig): Promise<void> {
    if (this._running) {
      throw new Error("Daemon already running");
    }
    this.shutdownTimeoutMs = config.shutdownTimeoutMs ?? 30_000;
    this.socketPath = resolveDaemonSocketPath(config.socketPath);
    this.eventStorePath = config.eventStorePath ?? "";
    this.processes = new ProcessManager();
    this.gateway = new GatewayBridge(this.processes, config.gateway);
    await this.gateway.start();
    this.kernelBridge = new KernelBridge(this.eventStorePath);
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
    await this.kernelBridge?.destroy();
    this.kernelBridge = null;
    this.runtime = null;
    this.processes = null;
    this.subs.clear();
  }
}
