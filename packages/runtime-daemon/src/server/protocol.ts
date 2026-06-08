import type {
  ControlMessage,
  EventFilter,
  RuntimeClientMessage,
  RuntimeServerMessage,
} from "@kirakira/runtime-contracts";

export type ClientMessage = RuntimeClientMessage;
export type ServerMessage = RuntimeServerMessage;

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = o.type;
  if (t === "ping") {
    return {
      type: "ping",
      messageId: typeof o.messageId === "string" ? o.messageId : undefined,
    };
  }
  if (t === "get_state") {
    if (typeof o.runId !== "string" || typeof o.messageId !== "string") return null;
    return { type: "get_state", runId: o.runId, messageId: o.messageId };
  }
  if (t === "unsubscribe") {
    if (typeof o.subscriptionId !== "string") return null;
    return {
      type: "unsubscribe",
      subscriptionId: o.subscriptionId,
      messageId: typeof o.messageId === "string" ? o.messageId : undefined,
    };
  }
  if (t === "subscribe") {
    return {
      type: "subscribe",
      runId: typeof o.runId === "string" ? o.runId : undefined,
      filter:
        o.filter !== undefined && o.filter !== null && typeof o.filter === "object"
          ? (o.filter as EventFilter)
          : undefined,
      afterSeq: typeof o.afterSeq === "number" ? o.afterSeq : undefined,
      messageId: typeof o.messageId === "string" ? o.messageId : undefined,
    };
  }
  if (t === "control") {
    if (!o.message || typeof o.message !== "object") return null;
    return {
      type: "control",
      message: o.message as ControlMessage,
      messageId: typeof o.messageId === "string" ? o.messageId : undefined,
    };
  }
  return null;
}

export function safeJsonStringify(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data as ServerMessage;
  } catch {
    return null;
  }
}
