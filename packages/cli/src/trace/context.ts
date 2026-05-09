import {
  context,
  ROOT_CONTEXT,
  trace,
  TraceFlags,
  type Context,
  type SpanContext,
} from "@opentelemetry/api";

type Carrier = Record<string, string | string[] | undefined>;

function getHeader(carrier: Carrier, key: string): string | undefined {
  const v = carrier[key] ?? carrier[key.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Parse W3C `traceparent` (`00-{traceId}-{parentId}-{flags}`).
 */
export function parseTraceParentHeader(value: string | undefined): SpanContext | undefined {
  if (!value) return undefined;
  const parts = value.split("-");
  if (parts.length !== 4) return undefined;
  const [, traceId, parentSpanId, flagsHex] = parts;
  if (!traceId || !parentSpanId || !flagsHex) return undefined;
  if (traceId.length !== 32 || parentSpanId.length !== 16) return undefined;
  const traceFlags = Number.parseInt(flagsHex, 16);
  if (Number.isNaN(traceFlags)) return undefined;
  return {
    traceId,
    spanId: parentSpanId,
    traceFlags,
  };
}

export function serializeTraceParent(spanCtx: SpanContext): string {
  const flags = spanCtx.traceFlags ?? TraceFlags.NONE;
  return `00-${spanCtx.traceId}-${spanCtx.spanId}-${flags.toString(16).padStart(2, "0")}`;
}

export function injectTraceContext(carrier: Carrier, ctx: Context = context.active()): void {
  const sc = trace.getSpanContext(ctx);
  if (!sc || !trace.isSpanContextValid(sc)) return;
  carrier.traceparent = serializeTraceParent(sc);
}

export function extractTraceContext(carrier: Carrier, parent: Context = ROOT_CONTEXT): Context {
  const tp = getHeader(carrier, "traceparent");
  const remote = parseTraceParentHeader(tp);
  if (!remote) return parent;
  return trace.setSpanContext(parent, remote);
}

export function withExtractedContext<T>(carrier: Carrier, fn: () => T): T {
  const remote = extractTraceContext(carrier);
  return context.with(remote, fn);
}

export function getActiveTraceId(): string | undefined {
  const sc = trace.getSpanContext(context.active());
  return sc && trace.isSpanContextValid(sc) ? sc.traceId : undefined;
}

export { context, trace };
