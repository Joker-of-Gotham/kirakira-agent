import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import type { DaemonClient, ServerMessage } from "@kirakira/runtime-daemon";
import {
  isRuntimeDaemonHealth,
  parseRuntimeClientMessage,
  sanitizeRuntimeDaemonHealth,
  type RuntimeDaemonHealth,
  type RuntimeClientMessage,
  type RuntimeMcpListRequest,
  type RuntimeMcpToolCallRequest,
} from "@kirakira/runtime-contracts";
import type {
  ApprovalDecision,
  EnqueuePromptRequest,
  InspectRunRequest,
  ProvideRunInputRequest,
  ResumeRunRequest,
  RuntimeArtifactContentRequest,
  RuntimeTransportEvent,
  RuntimeTransportStatus,
  SteerRunRequest,
  SubmitPromptRequest,
  SubscribeRunOptions,
} from "@kirakira/frontend-core";
import { RUNTIME_IPC_CHANNELS } from "./preload-contract.js";

export interface RuntimeIpcControllerOptions {
  client: Pick<
    DaemonClient,
    | "connect"
    | "disconnect"
    | "submitPrompt"
    | "getState"
    | "getArtifactContent"
    | "listMcpTools"
    | "callMcpTool"
    | "subscribeToRun"
    | "unsubscribe"
    | "steerRun"
    | "enqueuePrompt"
    | "approve"
    | "provideInput"
    | "resume"
    | "inspectThread"
    | "cancel"
    | "drain"
    | "onMessage"
  >;
  getHealth?: () => Promise<RuntimeDaemonHealth> | RuntimeDaemonHealth;
  webContentsFromId(id: number): Pick<WebContents, "send" | "isDestroyed"> | undefined;
  socketPath?: string;
  isTrustedSender?(event: IpcMainInvokeEvent): boolean;
  idFactory?: () => string;
}

interface DesktopSubscription {
  runId: string;
  webContentsId: number;
  options?: SubscribeRunOptions;
  subscribeMessageId: string;
  daemonSubscriptionId?: string;
  disposed?: boolean;
}

const defaultIdFactory = () =>
  `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function validateRuntimeClientMessage(raw: RuntimeClientMessage): RuntimeClientMessage {
  const result = parseRuntimeClientMessage(raw);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.message;
}

function runtimeTransportStatus(
  input: Omit<RuntimeTransportStatus, "mode">,
): RuntimeTransportStatus {
  return {
    mode: "desktop-ipc",
    ...input,
  };
}

async function getRuntimeStatus(
  connected: boolean,
  getHealth?: () => Promise<RuntimeDaemonHealth> | RuntimeDaemonHealth,
): Promise<RuntimeTransportStatus> {
  if (!getHealth) {
    return runtimeTransportStatus({
      state: connected ? "healthy" : "unknown",
      label: "Desktop IPC",
      detail: connected ? "Connected to daemon socket" : "Daemon socket not connected",
    });
  }
  const health = await getHealth();
  if (!isRuntimeDaemonHealth(health)) {
    throw new Error("Runtime daemon health response is invalid");
  }
  const sanitizedHealth = sanitizeRuntimeDaemonHealth(health);
  return runtimeTransportStatus({
    state: sanitizedHealth.ok ? "healthy" : "unavailable",
    label: "Desktop daemon",
    detail: sanitizedHealth.ok ? undefined : "Daemon health check reported unavailable",
    health: sanitizedHealth,
  });
}

function validateControlMessage(
  message: RuntimeClientMessage & { type: "control" },
): Extract<RuntimeClientMessage, { type: "control" }> {
  const validated = validateRuntimeClientMessage(message);
  if (validated.type !== "control") {
    throw new Error("control message is malformed or unsupported");
  }
  return validated;
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  isTrustedSender?: (event: IpcMainInvokeEvent) => boolean,
): void {
  if (isTrustedSender && !isTrustedSender(event)) {
    throw new Error("Untrusted runtime IPC sender");
  }
}

function parseSubmitPromptRequest(value: unknown): SubmitPromptRequest {
  if (!isRecord(value) || typeof value.prompt !== "string") {
    throw new Error("submitPrompt requires a prompt");
  }
  const mode = optionalString(value.mode);
  if (mode !== undefined && mode !== "interactive" && mode !== "headless" && mode !== "dry_run") {
    throw new Error("submitPrompt mode is invalid");
  }
  const request: SubmitPromptRequest = {
    prompt: value.prompt,
  };
  if (mode !== undefined) request.mode = mode;
  if (value.options !== undefined) {
    if (!isRecord(value.options)) throw new Error("submitPrompt options must be an object");
    request.options = value.options;
  }
  validateControlMessage({
    type: "control",
    message:
      request.options !== undefined
        ? { type: "submit", prompt: request.prompt, mode: request.mode ?? "interactive", options: request.options }
        : { type: "submit", prompt: request.prompt, mode: request.mode ?? "interactive" },
  });
  return request;
}

function parseRunId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} requires runId`);
  }
  return value;
}

function parseArtifactContentRequest(value: unknown): RuntimeArtifactContentRequest {
  if (!isRecord(value)) throw new Error("getArtifactContent requires a request object");
  const runId = parseRunId(value.runId, "getArtifactContent");
  if (typeof value.artifactId !== "string" || value.artifactId.length === 0) {
    throw new Error("getArtifactContent requires artifactId");
  }
  const maxBytes = optionalNumber(value.maxBytes);
  if (value.maxBytes !== undefined && (maxBytes === undefined || maxBytes < 1)) {
    throw new Error("getArtifactContent maxBytes must be a positive number");
  }
  const validated = validateRuntimeClientMessage({
    type: "get_artifact",
    runId,
    artifactId: value.artifactId,
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    messageId: "desktop-artifact-validate",
  });
  if (validated.type !== "get_artifact") {
    throw new Error("getArtifactContent message is malformed");
  }
  return {
    runId,
    artifactId: validated.artifactId,
    ...(validated.maxBytes !== undefined ? { maxBytes: validated.maxBytes } : {}),
  };
}

function parseMcpToolCallRequest(value: unknown): RuntimeMcpToolCallRequest {
  if (!isRecord(value)) throw new Error("callMcpTool requires a request object");
  if (typeof value.server !== "string" || value.server.length === 0) {
    throw new Error("callMcpTool requires server");
  }
  if (typeof value.tool !== "string" || value.tool.length === 0) {
    throw new Error("callMcpTool requires tool");
  }
  if (value.arguments !== undefined && !isRecord(value.arguments)) {
    throw new Error("callMcpTool arguments must be an object");
  }
  const runId = optionalString(value.runId);
  if (value.runId !== undefined && runId === undefined) {
    throw new Error("callMcpTool runId must be a string");
  }
  const traceId = optionalString(value.traceId);
  if (value.traceId !== undefined && traceId === undefined) {
    throw new Error("callMcpTool traceId must be a string");
  }
  const validated = validateRuntimeClientMessage({
    type: "mcp_call",
    server: value.server,
    tool: value.tool,
    ...(value.arguments !== undefined ? { arguments: value.arguments } : {}),
    ...(runId !== undefined ? { runId } : {}),
    ...(traceId !== undefined ? { traceId } : {}),
    messageId: "desktop-mcp-validate",
  });
  if (validated.type !== "mcp_call") {
    throw new Error("callMcpTool message is malformed");
  }
  return {
    server: validated.server,
    tool: validated.tool,
    ...(validated.arguments !== undefined ? { arguments: validated.arguments } : {}),
    ...(validated.runId !== undefined ? { runId: validated.runId } : {}),
    ...(validated.traceId !== undefined ? { traceId: validated.traceId } : {}),
  };
}

function parseMcpListRequest(value: unknown): RuntimeMcpListRequest {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new Error("listMcpTools requires a request object");
  const server = optionalString(value.server);
  if (value.server !== undefined && server === undefined) {
    throw new Error("listMcpTools server must be a string");
  }
  if (value.includeTools !== undefined && typeof value.includeTools !== "boolean") {
    throw new Error("listMcpTools includeTools must be a boolean");
  }
  if (value.startServers !== undefined && typeof value.startServers !== "boolean") {
    throw new Error("listMcpTools startServers must be a boolean");
  }
  const validated = validateRuntimeClientMessage({
    type: "mcp_list",
    ...(server !== undefined ? { server } : {}),
    ...(value.includeTools !== undefined ? { includeTools: value.includeTools } : {}),
    ...(value.startServers !== undefined ? { startServers: value.startServers } : {}),
    messageId: "desktop-mcp-list-validate",
  });
  if (validated.type !== "mcp_list") {
    throw new Error("listMcpTools message is malformed");
  }
  return {
    ...(validated.server !== undefined ? { server: validated.server } : {}),
    ...(validated.includeTools !== undefined ? { includeTools: validated.includeTools } : {}),
    ...(validated.startServers !== undefined ? { startServers: validated.startServers } : {}),
  };
}

function parseSubscriptionId(value: unknown): string {
  if (!isRecord(value) || typeof value.subscriptionId !== "string" || value.subscriptionId.length === 0) {
    throw new Error("runtime subscriptionId is required");
  }
  validateRuntimeClientMessage({ type: "unsubscribe", subscriptionId: value.subscriptionId });
  return value.subscriptionId;
}

function parseSubscribeOptions(value: unknown): SubscribeRunOptions | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error("subscribe options must be an object");
  const options: SubscribeRunOptions = {};
  if (value.afterSeq !== undefined) {
    const afterSeq = optionalNumber(value.afterSeq);
    if (afterSeq === undefined || afterSeq < 0) {
      throw new Error("subscribe afterSeq must be a non-negative number");
    }
    options.afterSeq = afterSeq;
  }
  if (value.filter !== undefined) {
    if (!isRecord(value.filter)) throw new Error("subscribe filter must be an object");
    options.filter = value.filter;
  }
  return options;
}

function parseSubscribeRequest(value: unknown): {
  runId: string;
  options?: SubscribeRunOptions;
  subscriptionId: string;
} {
  if (!isRecord(value)) throw new Error("subscribeRun requires a request object");
  const runId = parseRunId(value.runId, "subscribeRun");
  const options = parseSubscribeOptions(value.options);
  const validated = validateRuntimeClientMessage({
    type: "subscribe",
    runId,
    filter: options?.filter,
    afterSeq: options?.afterSeq,
  });
  if (validated.type !== "subscribe") {
    throw new Error("subscribe message is malformed");
  }
  return {
    runId,
    options: validated.filter !== undefined || validated.afterSeq !== undefined
      ? {
          ...(validated.filter !== undefined ? { filter: validated.filter } : {}),
          ...(validated.afterSeq !== undefined ? { afterSeq: validated.afterSeq } : {}),
        }
      : undefined,
    subscriptionId: parseSubscriptionId(value),
  };
}

function parseApprovalDecision(value: unknown): ApprovalDecision {
  if (
    !isRecord(value) ||
    typeof value.runId !== "string" ||
    typeof value.ticketId !== "string" ||
    (value.decision !== "approve" && value.decision !== "reject")
  ) {
    throw new Error("approve requires a valid approval decision");
  }
  const decision: ApprovalDecision = {
    runId: value.runId,
    ticketId: value.ticketId,
    decision: value.decision,
  };
  const reason = optionalString(value.reason);
  if (reason !== undefined) decision.reason = reason;
  validateControlMessage({
    type: "control",
    message:
      reason !== undefined
        ? {
            type: "approve",
            runId: decision.runId,
            ticketId: decision.ticketId,
            decision: decision.decision,
            reason,
          }
        : {
            type: "approve",
            runId: decision.runId,
            ticketId: decision.ticketId,
            decision: decision.decision,
          },
  });
  return decision;
}

function parseCancelRequest(value: unknown): { runId: string; reason?: string } {
  if (!isRecord(value)) throw new Error("cancel requires a request object");
  const runId = parseRunId(value.runId, "cancel");
  const reason = optionalString(value.reason);
  validateControlMessage({
    type: "control",
    message: reason === undefined ? { type: "cancel", runId } : { type: "cancel", runId, reason },
  });
  return reason === undefined ? { runId } : { runId, reason };
}

function parseSteerRunRequest(value: unknown): SteerRunRequest {
  if (!isRecord(value)) throw new Error("steer requires a request object");
  const runId = parseRunId(value.runId, "steer");
  if (typeof value.instruction !== "string") {
    throw new Error("steer requires instruction");
  }
  const priority =
    value.priority === undefined
      ? undefined
      : value.priority === "high" || value.priority === "normal"
        ? value.priority
        : null;
  if (priority === null) {
    throw new Error("steer priority is invalid");
  }
  const request: SteerRunRequest = {
    runId,
    instruction: value.instruction,
    ...(priority !== undefined ? { priority } : {}),
  };
  validateControlMessage({ type: "control", message: { type: "steer", ...request } });
  return request;
}

function parseEnqueuePromptRequest(value: unknown): EnqueuePromptRequest {
  if (!isRecord(value)) throw new Error("enqueue requires a request object");
  if (typeof value.prompt !== "string") {
    throw new Error("enqueue requires prompt");
  }
  const priority = optionalNumber(value.priority);
  if (value.priority !== undefined && priority === undefined) {
    throw new Error("enqueue priority must be a number");
  }
  const runId = value.runId === undefined ? undefined : parseRunId(value.runId, "enqueue");
  const request: EnqueuePromptRequest = {
    prompt: value.prompt,
    ...(priority !== undefined ? { priority } : {}),
    ...(runId !== undefined ? { runId } : {}),
  };
  validateControlMessage({ type: "control", message: { type: "enqueue", ...request } });
  return request;
}

function parseProvideInputRequest(value: unknown): ProvideRunInputRequest {
  if (!isRecord(value)) throw new Error("provideInput requires a request object");
  const runId = parseRunId(value.runId, "provideInput");
  if (typeof value.interruptId !== "string" || value.interruptId.length === 0) {
    throw new Error("provideInput requires interruptId");
  }
  const request: ProvideRunInputRequest = {
    runId,
    interruptId: value.interruptId,
    data: value.data,
  };
  validateControlMessage({ type: "control", message: { type: "provide_input", ...request } });
  return request;
}

function parseResumeRunRequest(value: unknown): ResumeRunRequest {
  if (!isRecord(value)) throw new Error("resume requires a request object");
  const runId = parseRunId(value.runId, "resume");
  const fromCheckpoint = optionalString(value.fromCheckpoint);
  if (value.fromCheckpoint !== undefined && fromCheckpoint === undefined) {
    throw new Error("resume fromCheckpoint must be a string");
  }
  const request: ResumeRunRequest = {
    runId,
    ...(fromCheckpoint !== undefined ? { fromCheckpoint } : {}),
  };
  validateControlMessage({ type: "control", message: { type: "resume", ...request } });
  return request;
}

function parseInspectRunRequest(value: unknown): InspectRunRequest {
  if (!isRecord(value)) throw new Error("inspect requires a request object");
  const runId = parseRunId(value.runId, "inspect");
  if (value.includeEvents !== undefined && typeof value.includeEvents !== "boolean") {
    throw new Error("inspect includeEvents must be a boolean");
  }
  const request: InspectRunRequest = {
    runId,
    ...(value.includeEvents !== undefined ? { includeEvents: value.includeEvents } : {}),
  };
  validateControlMessage({ type: "control", message: { type: "inspect", ...request } });
  return request;
}

const eventMatches = (
  message: ServerMessage,
  runId: string,
  options?: SubscribeRunOptions,
): message is Extract<ServerMessage, { type: "event" }> => {
  if (message.type !== "event") return false;
  if (message.event.runId !== runId) return false;
  if (options?.afterSeq !== undefined && (message.event.checkpointSeq ?? 0) <= options.afterSeq) {
    return false;
  }
  if (options?.filter?.kinds && !options.filter.kinds.includes(message.event.kind)) {
    return false;
  }
  return true;
};

export function createRuntimeIpcController(options: RuntimeIpcControllerOptions) {
  const subscriptions = new Map<string, DesktopSubscription>();
  let connected = false;

  const ensureConnected = async () => {
    if (connected) return;
    await options.client.connect(options.socketPath);
    connected = true;
  };

  const findSubscriptionBySubscribeMessageId = (messageId: string) => {
    for (const [subscriptionId, subscription] of subscriptions) {
      if (subscription.subscribeMessageId === messageId) {
        return { subscriptionId, subscription };
      }
    }
    return null;
  };

  const sendSubscriptionError = (
    subscriptionId: string,
    subscription: DesktopSubscription,
    message: Extract<ServerMessage, { type: "error" }>,
  ) => {
    if (subscription.disposed) return;
    const target = options.webContentsFromId(subscription.webContentsId);
    if (!target || target.isDestroyed()) return;
    const payload: RuntimeTransportEvent = {
      type: "error",
      message: message.message,
      detail: message,
    };
    target.send(`runtime:event:${subscriptionId}`, payload);
  };

  const disposeSubscription = (subscriptionId: string, senderId?: number) => {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) return;
    if (senderId !== undefined && subscription.webContentsId !== senderId) {
      throw new Error("Renderer does not own runtime subscription");
    }
    if (subscription.daemonSubscriptionId) {
      options.client.unsubscribe(subscription.daemonSubscriptionId);
      subscriptions.delete(subscriptionId);
      return;
    }
    subscription.disposed = true;
  };

  const disposeAll = () => {
    for (const subscriptionId of subscriptions.keys()) {
      disposeSubscription(subscriptionId);
    }
    subscriptions.clear();
  };

  const removeMessageHandler = options.client.onMessage((message) => {
    if (message.type === "error" && message.messageId) {
      const matched = findSubscriptionBySubscribeMessageId(message.messageId);
      if (matched) {
        sendSubscriptionError(matched.subscriptionId, matched.subscription, message);
        subscriptions.delete(matched.subscriptionId);
        return;
      }
    }
    if (message.type === "subscribed" && message.messageId) {
      const matched = findSubscriptionBySubscribeMessageId(message.messageId);
      if (matched) {
        matched.subscription.daemonSubscriptionId = message.subscriptionId;
        if (matched.subscription.disposed) {
          options.client.unsubscribe(message.subscriptionId);
          subscriptions.delete(matched.subscriptionId);
        }
      }
      return;
    }
    for (const [subscriptionId, subscription] of subscriptions) {
      if (subscription.disposed) continue;
      if (!eventMatches(message, subscription.runId, subscription.options)) continue;
      const target = options.webContentsFromId(subscription.webContentsId);
      if (!target || target.isDestroyed()) {
        disposeSubscription(subscriptionId);
        continue;
      }
      const payload: RuntimeTransportEvent = { type: "event", event: message.event };
      target.send(`runtime:event:${subscriptionId}`, payload);
    }
  });

  return {
    subscriptionCount: () => subscriptions.size,
    disposeSubscription,
    dispose() {
      disposeAll();
      removeMessageHandler();
    },
    register(ipcMain: Pick<IpcMain, "handle">) {
      ipcMain.handle(RUNTIME_IPC_CHANNELS.connect, async (event) => {
        assertTrustedSender(event, options.isTrustedSender);
        await ensureConnected();
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.disconnect, (event) => {
        assertTrustedSender(event, options.isTrustedSender);
        disposeAll();
        options.client.disconnect();
        connected = false;
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.getStatus, async (event, ...args: unknown[]) => {
        assertTrustedSender(event, options.isTrustedSender);
        if (args.length > 0) {
          throw new Error("runtime:getStatus does not accept arguments");
        }
        return getRuntimeStatus(connected, options.getHealth);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.submitPrompt, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseSubmitPromptRequest(rawRequest);
        await ensureConnected();
        const runId = await options.client.submitPrompt(
          request.prompt,
          request.mode ?? "interactive",
          request.options,
        );
        return { runId };
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.getState, async (event, rawRunId: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const runId = parseRunId(rawRunId, "getState");
        validateRuntimeClientMessage({
          type: "get_state",
          runId,
          messageId: (options.idFactory ?? defaultIdFactory)(),
        });
        await ensureConnected();
        return { runId, state: await options.client.getState(runId) };
      });

      ipcMain.handle(
        RUNTIME_IPC_CHANNELS.getArtifactContent,
        async (event, rawRequest: unknown) => {
          assertTrustedSender(event, options.isTrustedSender);
          const request = parseArtifactContentRequest(rawRequest);
          await ensureConnected();
          return options.client.getArtifactContent(request);
        },
      );

      ipcMain.handle(RUNTIME_IPC_CHANNELS.listMcpTools, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseMcpListRequest(rawRequest);
        await ensureConnected();
        return options.client.listMcpTools(request);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.callMcpTool, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseMcpToolCallRequest(rawRequest);
        await ensureConnected();
        return options.client.callMcpTool(request);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.subscribeRun, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseSubscribeRequest(rawRequest);
        await ensureConnected();
        const subscribeMessageId = (options.idFactory ?? defaultIdFactory)();
        subscriptions.set(request.subscriptionId, {
          runId: request.runId,
          webContentsId: event.sender.id,
          options: request.options,
          subscribeMessageId,
        });
        options.client.subscribeToRun(request.runId, {
          afterSeq: request.options?.afterSeq,
          filter: request.options?.filter,
          messageId: subscribeMessageId,
        });
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.unsubscribeRun, (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        disposeSubscription(parseSubscriptionId(rawRequest), event.sender.id);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.steer, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseSteerRunRequest(rawRequest);
        await ensureConnected();
        await options.client.steerRun(request.runId, request.instruction, request.priority);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.enqueue, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseEnqueuePromptRequest(rawRequest);
        await ensureConnected();
        await options.client.enqueuePrompt(request.prompt, request.priority, request.runId);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.approve, async (event, rawDecision: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const decision = parseApprovalDecision(rawDecision);
        await ensureConnected();
        await options.client.approve(
          decision.ticketId,
          decision.decision,
          decision.reason,
          decision.runId,
        );
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.provideInput, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseProvideInputRequest(rawRequest);
        await ensureConnected();
        await options.client.provideInput(request.runId, request.interruptId, request.data);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.resume, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseResumeRunRequest(rawRequest);
        await ensureConnected();
        await options.client.resume(request.runId, request.fromCheckpoint);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.inspect, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseInspectRunRequest(rawRequest);
        await ensureConnected();
        return {
          runId: request.runId,
          state: await options.client.inspectThread(request.runId, request.includeEvents),
        };
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.cancel, async (event, rawRequest: unknown) => {
        assertTrustedSender(event, options.isTrustedSender);
        const request = parseCancelRequest(rawRequest);
        await ensureConnected();
        await options.client.cancel(request.runId, request.reason);
      });

      ipcMain.handle(RUNTIME_IPC_CHANNELS.drain, async (event) => {
        assertTrustedSender(event, options.isTrustedSender);
        validateControlMessage({ type: "control", message: { type: "drain" } });
        await ensureConnected();
        await options.client.drain();
      });
    },
  };
}
