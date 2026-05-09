import type { ControlMessage } from "@kirakira/orchestrator-kernel/daemon-orchestrator";
import type { EventFilter } from "@kirakira/event-store";
import type { RunEvent } from "@kirakira/event-store";
import type { RunStateSnapshot } from "../snapshot.js";

export type ClientMessage =
  | {
      type: "control";
      message: ControlMessage;
      messageId?: string;
    }
  | {
      type: "subscribe";
      runId?: string;
      filter?: EventFilter;
      afterSeq?: number;
      messageId?: string;
    }
  | {
      type: "unsubscribe";
      subscriptionId: string;
      messageId?: string;
    }
  | {
      type: "get_state";
      runId: string;
      messageId: string;
    }
  | {
      type: "ping";
      messageId?: string;
    };

export type ServerMessage =
  | { type: "event"; event: RunEvent }
  | { type: "state_snapshot"; state: RunStateSnapshot }
  | { type: "error"; code: string; message: string; details?: unknown }
  | { type: "ack"; messageId: string; result?: unknown }
  | { type: "pong"; messageId?: string }
  | {
      type: "subscribed";
      subscriptionId: string;
      messageId?: string;
      replayedThroughSeq?: number;
    };

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
