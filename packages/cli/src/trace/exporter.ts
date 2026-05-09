import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

function spanToRecord(span: ReadableSpan): Record<string, unknown> {
  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    name: span.name,
    kind: span.kind,
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    attributes: span.attributes,
    status: span.status,
    resource: span.resource.attributes,
  };
}

/**
 * Append-only JSONL exporter; suitable for local `exec --trace` diagnostics.
 */
export class JsonlSpanExporter implements SpanExporter {
  constructor(private readonly filePath: string) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    void (async () => {
      try {
        await mkdir(dirname(this.filePath), { recursive: true });
        const lines = spans.map((s) => `${JSON.stringify(spanToRecord(s))}\n`).join("");
        if (lines) await appendFile(this.filePath, lines, "utf8");
        resultCallback({ code: ExportResultCode.SUCCESS });
      } catch (err) {
        resultCallback({ code: ExportResultCode.FAILED, error: err as Error });
      }
    })();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
