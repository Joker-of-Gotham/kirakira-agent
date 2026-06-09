import type { ControlMessage, RuntimeRunMode, RuntimeRunOptions } from "./control.js";
import {
  normalizeRuntimeArtifactContentMaxBytes,
  type RuntimeArtifactContent,
} from "./artifact-content.js";
import {
  RUN_EVENT_KINDS,
  type EventFilter,
  type RunEvent,
  type RunEventKind,
} from "./events.js";
import type { RunStateSnapshot } from "./snapshot.js";
import type { RuntimeAckResultParser } from "./ack-result.js";
import type { RuntimeMcpListRequest, RuntimeMcpToolCallRequest } from "./mcp-call.js";

export type RuntimeClientMessage =
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
      type: "get_artifact";
      runId: string;
      artifactId: string;
      maxBytes?: number;
      messageId: string;
    }
  | ({
      type: "mcp_call";
      messageId: string;
    } & RuntimeMcpToolCallRequest)
  | ({
      type: "mcp_list";
      messageId: string;
    } & RuntimeMcpListRequest)
  | {
      type: "ping";
      messageId?: string;
    };

export type RuntimeServerMessage =
  | { type: "event"; event: RunEvent }
  | { type: "state_snapshot"; state: RunStateSnapshot }
  | { type: "artifact_content"; artifact: RuntimeArtifactContent }
  | { type: "error"; code: string; message: string; details?: unknown; messageId?: string }
  | { type: "ack"; messageId: string; result?: unknown }
  | { type: "pong"; messageId?: string }
  | {
      type: "subscribed";
      subscriptionId: string;
      messageId?: string;
      replayedThroughSeq?: number;
    };

export interface RuntimeProtocolError {
  code: string;
  message: string;
  details?: unknown;
  messageId?: string;
}

export type RuntimeClientMessageParseResult =
  | { ok: true; message: RuntimeClientMessage }
  | { ok: false; error: RuntimeProtocolError };

export interface RuntimeRequestTrackerOptions {
  timeoutMs?: number;
  timeoutMessage?: (label: string) => string;
}

interface PendingRuntimeRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
  parseResult?: RuntimeAckResultParser<unknown>;
}

const RUN_EVENT_KIND_SET = new Set<string>(RUN_EVENT_KINDS);
const RUN_MODES = new Set(["interactive", "headless", "dry_run"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const optionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const error = (
  code: string,
  message: string,
  raw: Record<string, unknown> | undefined,
  details?: unknown,
): RuntimeClientMessageParseResult => ({
  ok: false,
  error: {
    code,
    message,
    details,
    messageId: optionalString(raw?.messageId),
  },
});

function parseRunOptions(value: unknown): RuntimeRunOptions | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const output: RuntimeRunOptions = {};
  if (value.budgetUsd !== undefined) {
    const budgetUsd = optionalNumber(value.budgetUsd);
    if (budgetUsd === undefined) return null;
    output.budgetUsd = budgetUsd;
  }
  if (value.workspaceRoot !== undefined) {
    const workspaceRoot = optionalString(value.workspaceRoot);
    if (workspaceRoot === undefined) return null;
    output.workspaceRoot = workspaceRoot;
  }
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) return null;
    output.metadata = value.metadata;
  }
  return output;
}

function parseControlMessage(value: unknown): ControlMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "submit": {
      if (
        typeof value.prompt !== "string" ||
        typeof value.mode !== "string" ||
        !RUN_MODES.has(value.mode)
      ) {
        return null;
      }
      const mode = value.mode as RuntimeRunMode;
      const options = parseRunOptions(value.options);
      if (options === null) return null;
      return options === undefined
        ? { type: "submit", prompt: value.prompt, mode }
        : { type: "submit", prompt: value.prompt, mode, options };
    }
    case "steer": {
      if (typeof value.runId !== "string" || typeof value.instruction !== "string") return null;
      const priority = optionalString(value.priority);
      if (priority !== undefined && priority !== "high" && priority !== "normal") return null;
      return priority === undefined
        ? { type: "steer", runId: value.runId, instruction: value.instruction }
        : { type: "steer", runId: value.runId, instruction: value.instruction, priority };
    }
    case "enqueue": {
      if (typeof value.prompt !== "string") return null;
      const priority = optionalNumber(value.priority);
      if (value.priority !== undefined && priority === undefined) return null;
      const runId = optionalString(value.runId);
      return {
        type: "enqueue",
        prompt: value.prompt,
        ...(priority !== undefined ? { priority } : {}),
        ...(runId !== undefined ? { runId } : {}),
      };
    }
    case "approve": {
      if (
        typeof value.runId !== "string" ||
        typeof value.ticketId !== "string" ||
        (value.decision !== "approve" && value.decision !== "reject")
      ) {
        return null;
      }
      const reason = optionalString(value.reason);
      return reason === undefined
        ? {
            type: "approve",
            runId: value.runId,
            ticketId: value.ticketId,
            decision: value.decision,
          }
        : {
            type: "approve",
            runId: value.runId,
            ticketId: value.ticketId,
            decision: value.decision,
            reason,
          };
    }
    case "provide_input":
      if (typeof value.runId !== "string" || typeof value.interruptId !== "string") return null;
      return {
        type: "provide_input",
        runId: value.runId,
        interruptId: value.interruptId,
        data: value.data,
      };
    case "drain":
      return { type: "drain" };
    case "cancel": {
      if (typeof value.runId !== "string") return null;
      const reason = optionalString(value.reason);
      return reason === undefined
        ? { type: "cancel", runId: value.runId }
        : { type: "cancel", runId: value.runId, reason };
    }
    case "resume": {
      if (typeof value.runId !== "string") return null;
      const fromCheckpoint = optionalString(value.fromCheckpoint);
      return fromCheckpoint === undefined
        ? { type: "resume", runId: value.runId }
        : { type: "resume", runId: value.runId, fromCheckpoint };
    }
    case "inspect": {
      if (typeof value.runId !== "string") return null;
      const includeEvents = optionalBoolean(value.includeEvents);
      if (value.includeEvents !== undefined && includeEvents === undefined) return null;
      return includeEvents === undefined
        ? { type: "inspect", runId: value.runId }
        : { type: "inspect", runId: value.runId, includeEvents };
    }
    default:
      return null;
  }
}

function parseEventFilter(value: unknown): EventFilter | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return null;
  const filter: EventFilter = {};
  if (value.runId !== undefined) {
    const runId = optionalString(value.runId);
    if (runId === undefined) return null;
    filter.runId = runId;
  }
  if (value.after !== undefined) {
    const after = optionalString(value.after);
    if (after === undefined) return null;
    filter.after = after;
  }
  if (value.before !== undefined) {
    const before = optionalString(value.before);
    if (before === undefined) return null;
    filter.before = before;
  }
  if (value.limit !== undefined) {
    const limit = optionalNumber(value.limit);
    if (limit === undefined || limit < 1) return null;
    filter.limit = limit;
  }
  if (value.kinds !== undefined) {
    if (!Array.isArray(value.kinds)) return null;
    const kinds = value.kinds.filter(
      (kind): kind is RunEventKind =>
        typeof kind === "string" && RUN_EVENT_KIND_SET.has(kind),
    );
    if (kinds.length !== value.kinds.length) return null;
    filter.kinds = kinds;
  }
  return filter;
}

function parseRecordArguments(value: unknown): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined;
  return isRecord(value) ? value : null;
}

export function parseRuntimeClientMessage(raw: unknown): RuntimeClientMessageParseResult {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return error("invalid_message", "Client message must be an object with a type", undefined, raw);
  }
  if (raw.messageId !== undefined && typeof raw.messageId !== "string") {
    return error("invalid_message", "messageId must be a string", raw, raw.messageId);
  }
  switch (raw.type) {
    case "ping":
      return {
        ok: true,
        message: { type: "ping", messageId: optionalString(raw.messageId) },
      };
    case "get_state":
      if (typeof raw.runId !== "string" || typeof raw.messageId !== "string") {
        return error("invalid_message", "get_state requires runId and messageId", raw, raw);
      }
      return {
        ok: true,
        message: { type: "get_state", runId: raw.runId, messageId: raw.messageId },
      };
    case "get_artifact": {
      if (
        typeof raw.runId !== "string" ||
        typeof raw.artifactId !== "string" ||
        typeof raw.messageId !== "string"
      ) {
        return error(
          "invalid_message",
          "get_artifact requires runId, artifactId, and messageId",
          raw,
          raw,
        );
      }
      const maxBytes = normalizeRuntimeArtifactContentMaxBytes(raw.maxBytes);
      if (raw.maxBytes !== undefined && maxBytes === undefined) {
        return error("invalid_message", "get_artifact maxBytes is invalid", raw, raw.maxBytes);
      }
      return {
        ok: true,
        message: {
          type: "get_artifact",
          runId: raw.runId,
          artifactId: raw.artifactId,
          messageId: raw.messageId,
          ...(maxBytes !== undefined ? { maxBytes } : {}),
        },
      };
    }
    case "mcp_call": {
      if (
        typeof raw.server !== "string" ||
        raw.server.length === 0 ||
        typeof raw.tool !== "string" ||
        raw.tool.length === 0 ||
        typeof raw.messageId !== "string"
      ) {
        return error("invalid_message", "mcp_call requires server, tool, and messageId", raw, raw);
      }
      const args = parseRecordArguments(raw.arguments);
      if (args === null) {
        return error("invalid_message", "mcp_call arguments must be an object", raw, raw.arguments);
      }
      const runId = optionalString(raw.runId);
      if (raw.runId !== undefined && runId === undefined) {
        return error("invalid_message", "mcp_call runId must be a string", raw, raw.runId);
      }
      const traceId = optionalString(raw.traceId);
      if (raw.traceId !== undefined && traceId === undefined) {
        return error("invalid_message", "mcp_call traceId must be a string", raw, raw.traceId);
      }
      const subagentId = optionalString(raw.subagentId);
      if (raw.subagentId !== undefined && subagentId === undefined) {
        return error("invalid_message", "mcp_call subagentId must be a string", raw, raw.subagentId);
      }
      const role = optionalString(raw.role);
      if (raw.role !== undefined && role === undefined) {
        return error("invalid_message", "mcp_call role must be a string", raw, raw.role);
      }
      const requestedLane = optionalString(raw.requestedLane);
      if (raw.requestedLane !== undefined && requestedLane === undefined) {
        return error(
          "invalid_message",
          "mcp_call requestedLane must be a string",
          raw,
          raw.requestedLane,
        );
      }
      return {
        ok: true,
        message: {
          type: "mcp_call",
          server: raw.server,
          tool: raw.tool,
          messageId: raw.messageId,
          ...(args !== undefined ? { arguments: args } : {}),
          ...(runId !== undefined ? { runId } : {}),
          ...(traceId !== undefined ? { traceId } : {}),
          ...(subagentId !== undefined ? { subagentId } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(requestedLane !== undefined ? { requestedLane } : {}),
        },
      };
    }
    case "mcp_list": {
      if (typeof raw.messageId !== "string") {
        return error("invalid_message", "mcp_list requires messageId", raw, raw);
      }
      const server = optionalString(raw.server);
      if (raw.server !== undefined && server === undefined) {
        return error("invalid_message", "mcp_list server must be a string", raw, raw.server);
      }
      const includeTools = optionalBoolean(raw.includeTools);
      if (raw.includeTools !== undefined && includeTools === undefined) {
        return error(
          "invalid_message",
          "mcp_list includeTools must be a boolean",
          raw,
          raw.includeTools,
        );
      }
      const startServers = optionalBoolean(raw.startServers);
      if (raw.startServers !== undefined && startServers === undefined) {
        return error(
          "invalid_message",
          "mcp_list startServers must be a boolean",
          raw,
          raw.startServers,
        );
      }
      return {
        ok: true,
        message: {
          type: "mcp_list",
          messageId: raw.messageId,
          ...(server !== undefined ? { server } : {}),
          ...(includeTools !== undefined ? { includeTools } : {}),
          ...(startServers !== undefined ? { startServers } : {}),
        },
      };
    }
    case "unsubscribe":
      if (typeof raw.subscriptionId !== "string") {
        return error("invalid_message", "unsubscribe requires subscriptionId", raw, raw);
      }
      return {
        ok: true,
        message: {
          type: "unsubscribe",
          subscriptionId: raw.subscriptionId,
          messageId: optionalString(raw.messageId),
        },
      };
    case "subscribe": {
      const filter = parseEventFilter(raw.filter);
      if (filter === null) {
        return error("invalid_filter", "subscribe filter is malformed", raw, raw.filter);
      }
      const afterSeq = optionalNumber(raw.afterSeq);
      if (raw.afterSeq !== undefined && (afterSeq === undefined || afterSeq < 0)) {
        return error("invalid_message", "afterSeq must be a non-negative number", raw, raw.afterSeq);
      }
      return {
        ok: true,
        message: {
          type: "subscribe",
          runId: optionalString(raw.runId),
          filter,
          afterSeq,
          messageId: optionalString(raw.messageId),
        },
      };
    }
    case "control": {
      const message = parseControlMessage(raw.message);
      if (!message) {
        return error("invalid_control", "control message is malformed or unsupported", raw, raw.message);
      }
      return {
        ok: true,
        message: {
          type: "control",
          message,
          messageId: optionalString(raw.messageId),
        },
      };
    }
    default:
      return error("invalid_message", `Unknown client message type: ${raw.type}`, raw, raw);
  }
}

export function isRuntimeServerMessage(value: unknown): value is RuntimeServerMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "event":
      return isRecord(value.event) && typeof value.event.runId === "string";
    case "state_snapshot":
      return value.state !== undefined;
    case "artifact_content":
      return isRecord(value.artifact) && typeof value.artifact.artifactId === "string";
    case "error":
      return typeof value.code === "string" && typeof value.message === "string";
    case "ack":
      return typeof value.messageId === "string";
    case "pong":
      return value.messageId === undefined || typeof value.messageId === "string";
    case "subscribed":
      return typeof value.subscriptionId === "string";
    default:
      return false;
  }
}

export function parseRuntimeServerMessage(raw: unknown): RuntimeServerMessage | null {
  return isRuntimeServerMessage(raw) ? raw : null;
}

export function makeRuntimeProtocolError(error: RuntimeProtocolError): Extract<RuntimeServerMessage, { type: "error" }> {
  return {
    type: "error",
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
    ...(error.messageId !== undefined ? { messageId: error.messageId } : {}),
  };
}

export function stringifyRuntimeServerMessage(message: RuntimeServerMessage): string {
  return JSON.stringify(message);
}

export class RuntimeRequestTracker {
  private readonly pending = new Map<string, PendingRuntimeRequest>();

  constructor(private readonly options: RuntimeRequestTrackerOptions = {}) {}

  get size(): number {
    return this.pending.size;
  }

  track<T = unknown>(
    messageId: string,
    label: string,
    timeoutMs = this.options.timeoutMs ?? 30_000,
    parseResult?: RuntimeAckResultParser<T>,
  ): Promise<T> {
    if (this.pending.has(messageId)) {
      return Promise.reject(new Error(`Duplicate runtime request id: ${messageId}`));
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(messageId);
        const message =
          this.options.timeoutMessage?.(label) ?? `Runtime request timed out: ${label}`;
        reject(new Error(message));
      }, timeoutMs);
      timeout.unref?.();
      this.pending.set(messageId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        parseResult: parseResult as RuntimeAckResultParser<unknown> | undefined,
      });
    });
  }

  resolve(messageId: string, value: unknown): boolean {
    const request = this.pending.get(messageId);
    if (!request) return false;
    clearTimeout(request.timeout);
    this.pending.delete(messageId);
    try {
      request.resolve(request.parseResult ? request.parseResult(value) : value);
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return true;
  }

  reject(messageId: string, error: Error): boolean {
    const request = this.pending.get(messageId);
    if (!request) return false;
    clearTimeout(request.timeout);
    this.pending.delete(messageId);
    request.reject(error);
    return true;
  }

  rejectAll(error: Error): void {
    for (const [messageId, request] of this.pending) {
      clearTimeout(request.timeout);
      request.reject(error);
      this.pending.delete(messageId);
    }
  }

  handleServerMessage(message: RuntimeServerMessage): boolean {
    if (message.type === "ack") {
      return this.resolve(message.messageId, message.result);
    }
    if (message.type === "pong" && message.messageId) {
      return this.resolve(message.messageId, undefined);
    }
    if (message.type === "error" && message.messageId) {
      return this.reject(message.messageId, new Error(message.message));
    }
    return false;
  }
}
