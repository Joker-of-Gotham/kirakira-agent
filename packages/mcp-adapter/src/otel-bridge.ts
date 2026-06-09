import { randomBytes } from "node:crypto";

export type McpSpanAttributeValue = string | number | boolean;
export type McpSpanAttributes = Record<string, McpSpanAttributeValue>;
export type McpSpanKind = "CLIENT" | "SERVER" | "INTERNAL";
export type McpSpanStatusCode = "UNSET" | "OK" | "ERROR";

export interface McpSpanStatus {
  code: McpSpanStatusCode;
  message?: string;
}

export interface McpSpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface McpSpanStartInput {
  name: string;
  kind?: McpSpanKind;
  attributes?: McpSpanAttributes;
  startTimeUnixMs?: number;
  traceId?: string;
  parentSpanId?: string;
}

export interface McpSpanEndInput {
  status?: McpSpanStatus;
  attributes?: McpSpanAttributes;
  endTimeUnixMs?: number;
}

export interface McpRecordedSpan {
  name: string;
  kind: McpSpanKind;
  context: McpSpanContext;
  attributes: McpSpanAttributes;
  startTimeUnixMs: number;
  endTimeUnixMs: number;
  durationMs: number;
  status: McpSpanStatus;
}

export interface McpSpanHandle {
  readonly context: McpSpanContext;
  setAttributes(attributes: McpSpanAttributes): void;
  end(input?: McpSpanEndInput): void | Promise<void>;
}

export interface McpSpanRecorder {
  startSpan(input: McpSpanStartInput): McpSpanHandle;
}

export interface McpSpanExporter {
  export(span: McpRecordedSpan): void | Promise<void>;
}

export class InMemoryMcpSpanExporter implements McpSpanExporter {
  readonly spans: McpRecordedSpan[] = [];

  export(span: McpRecordedSpan): void {
    this.spans.push(span);
  }

  clear(): void {
    this.spans.length = 0;
  }
}

export class ExportingMcpSpanRecorder implements McpSpanRecorder {
  constructor(private readonly exporter: McpSpanExporter) {}

  startSpan(input: McpSpanStartInput): McpSpanHandle {
    const startedAt = input.startTimeUnixMs ?? Date.now();
    const context: McpSpanContext = {
      traceId: normalizeTraceId(input.traceId),
      spanId: randomHex(8),
      ...(isValidSpanId(input.parentSpanId) ? { parentSpanId: input.parentSpanId.toLowerCase() } : {}),
    };
    const attributes: McpSpanAttributes = { ...(input.attributes ?? {}) };
    let ended = false;

    return {
      context,
      setAttributes(nextAttributes: McpSpanAttributes): void {
        Object.assign(attributes, nextAttributes);
      },
      end: async (endInput?: McpSpanEndInput): Promise<void> => {
        if (ended) return;
        ended = true;
        Object.assign(attributes, endInput?.attributes ?? {});
        const endTimeUnixMs = endInput?.endTimeUnixMs ?? Date.now();
        await this.exporter.export({
          name: input.name,
          kind: input.kind ?? "CLIENT",
          context,
          attributes: { ...attributes },
          startTimeUnixMs: startedAt,
          endTimeUnixMs,
          durationMs: Math.max(0, endTimeUnixMs - startedAt),
          status: endInput?.status ?? { code: "UNSET" },
        });
      },
    };
  }
}

export function traceparentFromSpanContext(context: McpSpanContext): string | undefined {
  if (!isValidTraceId(context.traceId) || !isValidSpanId(context.spanId)) {
    return undefined;
  }
  return `00-${context.traceId.toLowerCase()}-${context.spanId.toLowerCase()}-01`;
}

export function mcpMetaFromSpanContext(
  context: McpSpanContext,
): { traceparent: string } | undefined {
  const traceparent = traceparentFromSpanContext(context);
  return traceparent === undefined ? undefined : { traceparent };
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function normalizeTraceId(traceId: string | undefined): string {
  return isValidTraceId(traceId) ? traceId.toLowerCase() : randomHex(16);
}

function isValidTraceId(traceId: string | undefined): traceId is string {
  return typeof traceId === "string" && /^[0-9a-fA-F]{32}$/.test(traceId) && !/^0+$/.test(traceId);
}

function isValidSpanId(spanId: string | undefined): spanId is string {
  return typeof spanId === "string" && /^[0-9a-fA-F]{16}$/.test(spanId) && !/^0+$/.test(spanId);
}
