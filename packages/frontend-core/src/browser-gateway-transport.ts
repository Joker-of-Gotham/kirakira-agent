import type {
  RuntimeClientMessage,
  RuntimeRunMode,
  RuntimeServerMessage,
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

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ActiveSubscription {
  runId: string;
  options?: SubscribeRunOptions;
  listener: (event: RuntimeTransportEvent) => void;
  serverSubscriptionId?: string;
  subscribeMessageId: string;
}

const defaultIdFactory = () =>
  globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}-${Math.random()}`;

const appendToken = (endpoint: string, token: string | undefined): string => {
  if (!token) return endpoint;
  const url = new URL(endpoint, globalThis.location?.href ?? "http://127.0.0.1");
  url.searchParams.set("token", token);
  return url.toString();
};

const isServerMessage = (value: unknown): value is RuntimeServerMessage => {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "event" ||
    type === "state_snapshot" ||
    type === "error" ||
    type === "ack" ||
    type === "pong" ||
    type === "subscribed"
  );
};

const eventMatches = (
  event: Extract<RuntimeServerMessage, { type: "event" }>["event"],
  subscription: ActiveSubscription,
): boolean => {
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
  const pending = new Map<string, PendingRequest>();
  const subscriptions = new Map<string, ActiveSubscription>();
  const pendingSubscribeMessages = new Map<string, string>();
  let socket: WebSocket | null = null;

  const rejectAll = (error: Error) => {
    for (const [messageId, request] of pending) {
      clearTimeout(request.timeout);
      request.reject(error);
      pending.delete(messageId);
    }
  };

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
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(messageId);
        reject(new Error(`Runtime gateway request timed out: ${message.type}`));
      }, requestTimeoutMs);
      pending.set(messageId, { resolve, reject, timeout });
      try {
        send(body);
      } catch (err) {
        clearTimeout(timeout);
        pending.delete(messageId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
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
          if (subscription) subscription.serverSubscriptionId = message.subscriptionId;
          pendingSubscribeMessages.delete(message.messageId);
        }
      }
      return;
    }
    if (message.type === "ack" || message.type === "pong") {
      const messageId = message.messageId;
      if (!messageId) return;
      const current = pending.get(messageId);
      if (!current) return;
      clearTimeout(current.timeout);
      pending.delete(messageId);
      current.resolve(message.type === "ack" ? message.result : undefined);
      return;
    }
    if (message.type === "error") {
      const error = new Error(message.message);
      if (message.messageId) {
        const current = pending.get(message.messageId);
        if (current) {
          clearTimeout(current.timeout);
          pending.delete(message.messageId);
          current.reject(error);
          return;
        }
      }
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
        if (!isServerMessage(raw)) {
          notifySubscriptions({
            type: "error",
            message: "Runtime gateway sent an unknown message",
            detail: raw,
          });
          return;
        }
        handleIncoming(raw);
      });
      ws.addEventListener("close", () => {
        rejectAll(new Error("Runtime gateway connection closed"));
        notifySubscriptions({ type: "connection", state: "disconnected" });
      });
    },
    disconnect() {
      rejectAll(new Error("Runtime gateway disconnected"));
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
        subscriptions.delete(localId);
        if (subscription?.serverSubscriptionId) {
          send({
            type: "unsubscribe",
            subscriptionId: subscription.serverSubscriptionId,
            messageId: idFactory(),
          });
        }
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
