import { randomBytes } from "node:crypto";

export type McpSpanAttributeValue = string | number | boolean;
export type McpSpanAttributes = Record<string, McpSpanAttributeValue>;
export type McpSpanKind = "CLIENT" | "SERVER" | "INTERNAL";
export type McpSpanStatusCode = "UNSET" | "OK" | "ERROR";

export interface McpTraceContextCarrier {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

export interface McpTraceparentParts {
  traceId: string;
  parentSpanId: string;
  traceFlags: string;
  sampled: boolean;
}

export interface McpSpanStatus {
  code: McpSpanStatusCode;
  message?: string;
}

export interface McpSpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceState?: string;
}

export interface McpSpanStartInput {
  name: string;
  kind?: McpSpanKind;
  attributes?: McpSpanAttributes;
  startTimeUnixMs?: number;
  traceId?: string;
  parentSpanId?: string;
  traceContext?: McpTraceContextCarrier;
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
  getPropagationMeta?(): McpTraceContextCarrier | undefined;
  end(input?: McpSpanEndInput): void | Promise<void>;
}

export interface McpSpanRecorder {
  startSpan(input: McpSpanStartInput): McpSpanHandle;
}

export interface McpSpanExporter {
  export(span: McpRecordedSpan): void | Promise<void>;
}

export interface OpenTelemetryTextMapSetter {
  set(carrier: Record<string, string>, key: string, value: string): void;
}

export interface OpenTelemetryTextMapGetter {
  get(carrier: Record<string, string>, key: string): string | undefined;
  keys(carrier: Record<string, string>): string[];
}

export interface OpenTelemetrySpanContextLike {
  traceId?: string;
  spanId?: string;
  traceState?: { serialize(): string } | string;
}

export interface OpenTelemetrySpanLike {
  spanContext?(): OpenTelemetrySpanContextLike;
  setAttribute?(key: string, value: McpSpanAttributeValue): void;
  setAttributes?(attributes: McpSpanAttributes): void;
  setStatus?(status: { code: unknown; message?: string }): void;
  end?(endTime?: number): void;
}

export interface OpenTelemetryTracerLike {
  startSpan(name: string, options?: OpenTelemetrySpanOptionsLike, context?: unknown): OpenTelemetrySpanLike;
}

export interface OpenTelemetrySpanOptionsLike {
  kind?: unknown;
  attributes?: McpSpanAttributes;
  startTime?: number;
}

export interface OpenTelemetryApiLike {
  context: {
    active(): unknown;
  };
  trace: {
    getTracer(name: string, version?: string): OpenTelemetryTracerLike;
    setSpan(context: unknown, span: OpenTelemetrySpanLike): unknown;
  };
  propagation: {
    inject(context: unknown, carrier: Record<string, string>, setter?: OpenTelemetryTextMapSetter): void;
    extract?(context: unknown, carrier: Record<string, string>, getter?: OpenTelemetryTextMapGetter): unknown;
  };
  SpanKind?: Partial<Record<McpSpanKind, unknown>>;
  SpanStatusCode?: Partial<Record<McpSpanStatusCode, unknown>>;
}

export interface OpenTelemetryMcpSpanRecorderOptions {
  api: OpenTelemetryApiLike;
  tracerName?: string;
  tracerVersion?: string;
  defaultAttributes?: McpSpanAttributes;
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
    const incomingTraceparent = parseTraceparent(input.traceContext?.traceparent);
    const propagationMeta = normalizeMcpTraceContextCarrier({
      tracestate: input.traceContext?.tracestate,
      baggage: input.traceContext?.baggage,
    });
    const context: McpSpanContext = {
      traceId: normalizeTraceId(incomingTraceparent?.traceId ?? input.traceId),
      spanId: randomHex(8),
      ...(isValidSpanId(input.parentSpanId ?? incomingTraceparent?.parentSpanId)
        ? { parentSpanId: (input.parentSpanId ?? incomingTraceparent?.parentSpanId)?.toLowerCase() }
        : {}),
      ...(propagationMeta?.tracestate !== undefined ? { traceState: propagationMeta.tracestate } : {}),
    };
    const attributes: McpSpanAttributes = { ...(input.attributes ?? {}) };
    let ended = false;

    return {
      context,
      setAttributes(nextAttributes: McpSpanAttributes): void {
        Object.assign(attributes, nextAttributes);
      },
      getPropagationMeta(): McpTraceContextCarrier | undefined {
        return propagationMeta;
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

export class OpenTelemetryMcpSpanRecorder implements McpSpanRecorder {
  private readonly api: OpenTelemetryApiLike;
  private readonly tracer: OpenTelemetryTracerLike;
  private readonly defaultAttributes: McpSpanAttributes;

  constructor(options: OpenTelemetryMcpSpanRecorderOptions) {
    this.api = options.api;
    this.tracer = options.api.trace.getTracer(
      options.tracerName ?? "kirakira.mcp",
      options.tracerVersion,
    );
    this.defaultAttributes = options.defaultAttributes ?? {};
  }

  startSpan(input: McpSpanStartInput): McpSpanHandle {
    const parentContext = this.parentContext(input.traceContext);
    const span = this.tracer.startSpan(
      input.name,
      {
        kind: this.spanKind(input.kind ?? "CLIENT"),
        attributes: {
          ...this.defaultAttributes,
          ...(input.attributes ?? {}),
        },
        ...(input.startTimeUnixMs !== undefined ? { startTime: input.startTimeUnixMs } : {}),
      },
      parentContext,
    );
    const spanContextForPropagation = this.api.trace.setSpan(parentContext, span);
    const context = mcpContextFromOpenTelemetrySpan(span, input);
    const fallbackCarrier = normalizeMcpTraceContextCarrier(input.traceContext);
    let ended = false;

    return {
      context,
      setAttributes(attributes: McpSpanAttributes): void {
        setOpenTelemetryAttributes(span, attributes);
      },
      getPropagationMeta: (): McpTraceContextCarrier | undefined => {
        const carrier: Record<string, string> = {};
        try {
          this.api.propagation.inject(spanContextForPropagation, carrier, OTEL_TEXT_MAP_SETTER);
        } catch {
          return mcpMetaFromSpanContext(context, fallbackCarrier);
        }
        return mcpMetaFromSpanContext(context, normalizeMcpTraceContextCarrier(carrier));
      },
      end: (endInput?: McpSpanEndInput): void => {
        if (ended) return;
        ended = true;
        if (endInput?.attributes !== undefined) {
          setOpenTelemetryAttributes(span, endInput.attributes);
        }
        if (endInput?.status !== undefined) {
          span.setStatus?.({
            code: this.spanStatusCode(endInput.status.code),
            ...(endInput.status.message !== undefined ? { message: endInput.status.message } : {}),
          });
        }
        span.end?.(endInput?.endTimeUnixMs);
      },
    };
  }

  private parentContext(traceContext: McpTraceContextCarrier | undefined): unknown {
    const active = this.api.context.active();
    const carrier = normalizeMcpTraceContextCarrier(traceContext);
    if (carrier === undefined || this.api.propagation.extract === undefined) {
      return active;
    }
    try {
      return this.api.propagation.extract(active, toCarrierRecord(carrier), OTEL_TEXT_MAP_GETTER);
    } catch {
      return active;
    }
  }

  private spanKind(kind: McpSpanKind): unknown {
    const fallback: Record<McpSpanKind, number> = {
      INTERNAL: 0,
      SERVER: 1,
      CLIENT: 2,
    };
    return this.api.SpanKind?.[kind] ?? fallback[kind];
  }

  private spanStatusCode(code: McpSpanStatusCode): unknown {
    const fallback: Record<McpSpanStatusCode, number> = {
      UNSET: 0,
      OK: 1,
      ERROR: 2,
    };
    return this.api.SpanStatusCode?.[code] ?? fallback[code];
  }
}

export function createOpenTelemetryMcpSpanRecorder(
  options: OpenTelemetryMcpSpanRecorderOptions,
): McpSpanRecorder {
  return new OpenTelemetryMcpSpanRecorder(options);
}

export function traceparentFromSpanContext(context: McpSpanContext): string | undefined {
  if (!isValidTraceId(context.traceId) || !isValidSpanId(context.spanId)) {
    return undefined;
  }
  return `00-${context.traceId.toLowerCase()}-${context.spanId.toLowerCase()}-01`;
}

export function mcpMetaFromSpanContext(
  context: McpSpanContext,
  carrier?: McpTraceContextCarrier,
): McpTraceContextCarrier | undefined {
  const normalizedCarrier = normalizeMcpTraceContextCarrier(carrier);
  const carrierTraceparent =
    parseTraceparent(normalizedCarrier?.traceparent) !== undefined
      ? normalizedCarrier?.traceparent
      : undefined;
  const traceparent = carrierTraceparent ?? traceparentFromSpanContext(context);
  return normalizeMcpTraceContextCarrier({
    ...(traceparent !== undefined ? { traceparent } : {}),
    ...(normalizedCarrier?.tracestate !== undefined ? { tracestate: normalizedCarrier.tracestate } : {}),
    ...(normalizedCarrier?.baggage !== undefined ? { baggage: normalizedCarrier.baggage } : {}),
  });
}

export function mcpMetaFromSpanHandle(handle: McpSpanHandle): McpTraceContextCarrier | undefined {
  return mcpMetaFromSpanContext(handle.context, handle.getPropagationMeta?.());
}

export function normalizeMcpTraceContextCarrier(
  carrier: unknown,
): McpTraceContextCarrier | undefined {
  if (!isObjectRecord(carrier)) return undefined;
  const traceparent = nonEmptyString(carrier.traceparent);
  const tracestate = nonEmptyString(carrier.tracestate);
  const baggage = nonEmptyString(carrier.baggage);
  if (traceparent === undefined && tracestate === undefined && baggage === undefined) {
    return undefined;
  }
  return {
    ...(traceparent !== undefined ? { traceparent } : {}),
    ...(tracestate !== undefined ? { tracestate } : {}),
    ...(baggage !== undefined ? { baggage } : {}),
  };
}

export function parseTraceparent(traceparent: string | undefined): McpTraceparentParts | undefined {
  if (traceparent === undefined) return undefined;
  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-.+)?$/i.exec(
    traceparent,
  );
  if (!match) return undefined;
  const [, version, traceId, parentSpanId, traceFlags] = match;
  if (
    version === undefined ||
    traceId === undefined ||
    parentSpanId === undefined ||
    traceFlags === undefined ||
    version.toLowerCase() === "ff" ||
    !isValidTraceId(traceId) ||
    !isValidSpanId(parentSpanId)
  ) {
    return undefined;
  }
  const normalizedFlags = traceFlags.toLowerCase();
  return {
    traceId: traceId.toLowerCase(),
    parentSpanId: parentSpanId.toLowerCase(),
    traceFlags: normalizedFlags,
    sampled: (Number.parseInt(normalizedFlags, 16) & 1) === 1,
  };
}

const OTEL_TEXT_MAP_SETTER: OpenTelemetryTextMapSetter = {
  set(carrier: Record<string, string>, key: string, value: string): void {
    carrier[key] = value;
  },
};

const OTEL_TEXT_MAP_GETTER: OpenTelemetryTextMapGetter = {
  get(carrier: Record<string, string>, key: string): string | undefined {
    return carrier[key];
  },
  keys(carrier: Record<string, string>): string[] {
    return Object.keys(carrier);
  },
};

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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toCarrierRecord(carrier: McpTraceContextCarrier): Record<string, string> {
  return {
    ...(carrier.traceparent !== undefined ? { traceparent: carrier.traceparent } : {}),
    ...(carrier.tracestate !== undefined ? { tracestate: carrier.tracestate } : {}),
    ...(carrier.baggage !== undefined ? { baggage: carrier.baggage } : {}),
  };
}

function mcpContextFromOpenTelemetrySpan(
  span: OpenTelemetrySpanLike,
  input: McpSpanStartInput,
): McpSpanContext {
  const spanContext = span.spanContext?.();
  const incomingTraceparent = parseTraceparent(input.traceContext?.traceparent);
  const traceState = traceStateToString(spanContext?.traceState) ?? input.traceContext?.tracestate;
  return {
    traceId: normalizeTraceId(spanContext?.traceId ?? incomingTraceparent?.traceId ?? input.traceId),
    spanId: isValidSpanId(spanContext?.spanId) ? spanContext.spanId.toLowerCase() : randomHex(8),
    ...(isValidSpanId(input.parentSpanId ?? incomingTraceparent?.parentSpanId)
      ? { parentSpanId: (input.parentSpanId ?? incomingTraceparent?.parentSpanId)?.toLowerCase() }
      : {}),
    ...(traceState !== undefined ? { traceState } : {}),
  };
}

function traceStateToString(traceState: OpenTelemetrySpanContextLike["traceState"]): string | undefined {
  if (typeof traceState === "string") return traceState.length > 0 ? traceState : undefined;
  return traceState?.serialize();
}

function setOpenTelemetryAttributes(span: OpenTelemetrySpanLike, attributes: McpSpanAttributes): void {
  if (span.setAttributes !== undefined) {
    span.setAttributes(attributes);
    return;
  }
  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute?.(key, value);
  }
}
