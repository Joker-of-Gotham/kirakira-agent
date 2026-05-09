import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { SpanName } from "@kirakira/core";

const TRACER_NAME = "kirakira-cli";

function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

export function withSpan<T>(name: SpanName, fn: () => T): T {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, (span) => {
    try {
      const v = fn();
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute("kirakira.span.name", name);
      return v;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function withSpanAsync<T>(name: SpanName, fn: () => Promise<T>): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const v = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute("kirakira.span.name", name);
      return v;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

export function sessionStartSpan<T>(fn: () => T): T {
  return withSpan("session.start", fn);
}

export function promptSubmitSpan<T>(fn: () => T): T {
  return withSpan("prompt.submit", fn);
}

export { SpanStatusCode };
