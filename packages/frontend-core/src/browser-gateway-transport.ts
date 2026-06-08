import type {
  RuntimeClientMessage,
  RuntimeRunMode,
  RuntimeServerMessage,
} from "@kirakira/runtime-contracts";
import {
  RuntimeRequestTracker,
  parseRuntimeServerMessage,
} from "@kirakira/runtime-contracts";
import type {
  ApprovalDecision,
  RuntimeTransport,
  RuntimeTransportEvent,
  RuntimeTransportSnapshot,
  SubmitPromptRequest,
  SubscribeRunOptions,
  Unsubscribe,
} from "./transport.js";

export interface BrowserGatewayTransportOptions {
  endpoint: string;
  token?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  idFactory?: () => string;
  socketFactory?: (url: string) => WebSocket;
}

interface ActiveSubscription {
  runId: string;
  options?: SubscribeRunOptions;
  listener: (event: RuntimeTransportEvent) => void;
  serverSubscriptionId?: string;
  subscribeMessageId: string;
  cancelled?: boolean;
}

const defaultIdFactory = () =>
  globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}-${Math.random()}`;

const appendToken = (endpoint: string, token: string | undefined): string => {
  if (!token) return endpoint;
  const url = new URL(endpoint, globalThis.location?.href ?? "http://127.0.0.1");
  url.searchParams.set("token", token);
  return url.toString();
};

const eventMatches = (
  event: Extract<RuntimeServerMessage, { type: "event" }>["event"],
  subscription: ActiveSubscription,
): boolean => {
  if (subscription.cancelled) return false;
  if (event.runId !== subscription.runId) return false;
  if (
    subscription.options?.afterSeq !== undefined &&
    (event.checkpointSeq ?? 0) <= subscription.options.afterSeq
  ) {
    return false;
  }
  const kinds = subscription.options?.filter?.kinds;
  return !kinds || kinds.includes(event.kind);
};

export function createBrowserGatewayTransport(
  options: BrowserGatewayTransportOptions,
): RuntimeTransport {
  const idFactory = options.idFactory ?? defaultIdFactory;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  const socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
  const pending = new RuntimeRequestTracker({
    timeoutMs: requestTimeoutMs,
    timeoutMessage: (label) => `Runtime gateway request timed out: ${label}`,
  });
  const subscriptions = new Map<string, ActiveSubscription>();
  const pendingSubscribeMessages = new Map<string, string>();
  let socket: WebSocket | null = null;

  const notifySubscriptions = (event: RuntimeTransportEvent) => {
    for (const subscription of subscriptions.values()) {
      subscription.listener(event);
    }
  };

  const send = (message: RuntimeClientMessage): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Runtime gateway is not connected");
    }
    socket.send(JSON.stringify(message));
  };

  const request = (message: RuntimeClientMessage): Promise<unknown> => {
    const messageId =
      "messageId" in message && typeof message.messageId === "string"
        ? message.messageId
        : idFactory();
    const body = { ...message, messageId } as RuntimeClientMessage;
    const result = pending.track(messageId, message.type, requestTimeoutMs);
    try {
      send(body);
    } catch (err) {
      pending.reject(
        messageId,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
    return result;
  };

  const handleIncoming = (message: RuntimeServerMessage) => {
    if (message.type === "event") {
      for (const subscription of subscriptions.values()) {
        if (eventMatches(message.event, subscription)) {
          subscription.listener({ type: "event", event: message.event });
        }
      }
      return;
    }
    if (message.type === "subscribed") {
      if (message.messageId) {
        const localId = pendingSubscribeMessages.get(message.messageId);
        if (localId) {
          const subscription = subscriptions.get(localId);
          if (subscription) {
            subscription.serverSubscriptionId = message.subscriptionId;
            if (subscription.cancelled) {
              send({
                type: "unsubscribe",
                subscriptionId: message.subscriptionId,
                messageId: idFactory(),
              });
              subscriptions.delete(localId);
            }
          }
          pendingSubscribeMessages.delete(message.messageId);
        }
      }
      return;
    }
    if (message.type === "ack" || message.type === "pong") {
      pending.handleServerMessage(message);
      return;
    }
    if (message.type === "error") {
      if (pending.handleServerMessage(message)) return;
      notifySubscriptions({ type: "error", message: message.message, detail: message });
    }
  };

  return {
    mode: "browser-gateway",
    async connect() {
      if (socket?.readyState === WebSocket.OPEN) return;
      const ws = socketFactory(appendToken(options.endpoint, options.token));
      socket = ws;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Runtime gateway connection timed out"));
          ws.close();
        }, connectTimeoutMs);
        ws.addEventListener("open", () => {
          clearTimeout(timeout);
          resolve();
        });
        ws.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error("Runtime gateway connection failed"));
        });
      });
      ws.addEventListener("message", (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        } catch {
          notifySubscriptions({
            type: "error",
            message: "Runtime gateway sent invalid JSON",
            detail: event.data,
          });
          return;
        }
        const message = parseRuntimeServerMessage(raw);
        if (!message) {
          notifySubscriptions({
            type: "error",
            message: "Runtime gateway sent an unknown message",
            detail: raw,
          });
          return;
        }
        handleIncoming(message);
      });
      ws.addEventListener("close", () => {
        pending.rejectAll(new Error("Runtime gateway connection closed"));
        notifySubscriptions({ type: "connection", state: "disconnected" });
      });
    },
    disconnect() {
      pending.rejectAll(new Error("Runtime gateway disconnected"));
      socket?.close(1000, "client disconnect");
      socket = null;
      subscriptions.clear();
      pendingSubscribeMessages.clear();
    },
    async submitPrompt(input: SubmitPromptRequest) {
      const mode: RuntimeRunMode = input.mode ?? "interactive";
      const result = await request({
        type: "control",
        message:
          input.options !== undefined
            ? { type: "submit", prompt: input.prompt, mode, options: input.options }
            : { type: "submit", prompt: input.prompt, mode },
      });
      const runId = (result as { runId?: unknown } | null)?.runId;
      if (typeof runId !== "string") {
        throw new Error("Runtime gateway returned an invalid submit ack");
      }
      return { runId };
    },
    async getState(runId: string): Promise<RuntimeTransportSnapshot> {
      const state = await request({
        type: "get_state",
        runId,
        messageId: idFactory(),
      });
      return { runId, state };
    },
    subscribeRun(
      runId: string,
      listener: (event: RuntimeTransportEvent) => void,
      options?: SubscribeRunOptions,
    ): Unsubscribe {
      const localId = idFactory();
      const messageId = idFactory();
      subscriptions.set(localId, {
        runId,
        listener,
        options,
        subscribeMessageId: messageId,
      });
      pendingSubscribeMessages.set(messageId, localId);
      send({
        type: "subscribe",
        runId,
        filter: options?.filter,
        afterSeq: options?.afterSeq,
        messageId,
      });
      return () => {
        const subscription = subscriptions.get(localId);
        if (subscription?.serverSubscriptionId) {
          send({
            type: "unsubscribe",
            subscriptionId: subscription.serverSubscriptionId,
            messageId: idFactory(),
          });
          subscriptions.delete(localId);
          return;
        }
        if (subscription) subscription.cancelled = true;
      };
    },
    async approve(decision: ApprovalDecision) {
      await request({
        type: "control",
        message:
          decision.reason !== undefined
            ? {
                type: "approve",
                runId: decision.runId,
                ticketId: decision.ticketId,
                decision: decision.decision,
                reason: decision.reason,
              }
            : {
                type: "approve",
                runId: decision.runId,
                ticketId: decision.ticketId,
                decision: decision.decision,
              },
      });
    },
    async cancel(runId: string, reason?: string) {
      await request({
        type: "control",
        message:
          reason !== undefined
            ? { type: "cancel", runId, reason }
            : { type: "cancel", runId },
      });
    },
    async drain() {
      await request({ type: "control", message: { type: "drain" } });
    },
  };
}
