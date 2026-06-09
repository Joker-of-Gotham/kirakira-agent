import * as opentelemetry from "@opentelemetry/api";
import {
  defaultTextMapGetter,
  defaultTextMapSetter,
  type Context,
  type TextMapGetter,
  type TextMapSetter,
} from "@opentelemetry/api";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type {
  McpOtelRecorderPlan,
  McpOtelSdkFactory,
  McpOtelSdkFactoryOptions,
  OpenTelemetryApiLike,
} from "@kirakira/mcp-adapter";

const SERVICE_NAME_KEY = "service.name";
const DEFAULT_SERVICE_NAME = "kirakira-agent";
const SUPPORTED_EXPORTERS = new Set(["otlp"]);
const SUPPORTED_HTTP_PROTOCOLS = new Set(["http/json"]);

export function createDaemonMcpOtelSdkFactory(): McpOtelSdkFactory {
  return (options) => createDaemonMcpOtelSdk(options);
}

function createDaemonMcpOtelSdk(
  options: McpOtelSdkFactoryOptions,
): ReturnType<McpOtelSdkFactory> {
  validatePlan(options.plan);
  const provider = new NodeTracerProvider({
    resource: new Resource(resourceAttributesFromPlan(options.plan)),
  });
  provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter(exporterOptionsFromPlan(options.plan))));
  return {
    api: createLocalOpenTelemetryApi(provider),
    shutdown: () => provider.shutdown(),
  };
}

function createLocalOpenTelemetryApi(provider: NodeTracerProvider): OpenTelemetryApiLike {
  const propagator = new CompositePropagator({
    propagators: [
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
    ],
  });
  return {
    context: {
      active: () => opentelemetry.context.active(),
    },
    trace: {
      getTracer: (name, version) => {
        const tracer = provider.getTracer(name, version);
        return {
          startSpan: (spanName, options, context) =>
            tracer.startSpan(
              spanName,
              options as opentelemetry.SpanOptions | undefined,
              context as Context | undefined,
            ),
        };
      },
      setSpan: (context, span) =>
        opentelemetry.trace.setSpan(context as Context, span as opentelemetry.Span),
    },
    propagation: {
      inject: (context, carrier, setter) =>
        propagator.inject(
          context as Context,
          carrier,
          (setter ?? defaultTextMapSetter) as TextMapSetter<Record<string, string>>,
        ),
      extract: (context, carrier, getter) =>
        propagator.extract(
          context as Context,
          carrier,
          (getter ?? defaultTextMapGetter) as TextMapGetter<Record<string, string>>,
        ),
    },
    SpanKind: opentelemetry.SpanKind,
    SpanStatusCode: opentelemetry.SpanStatusCode,
  };
}

function validatePlan(plan: McpOtelRecorderPlan): void {
  const exporter = plan.sdk?.tracesExporter?.toLowerCase();
  if (exporter !== undefined && !SUPPORTED_EXPORTERS.has(exporter)) {
    throw new Error(
      `OpenTelemetry MCP SDK mode supports OTLP trace export only; got tracesExporter="${plan.sdk?.tracesExporter}"`,
    );
  }
  const protocol = (plan.sdk?.otlp?.tracesProtocol ?? plan.sdk?.otlp?.protocol)?.toLowerCase();
  if (protocol !== undefined && !SUPPORTED_HTTP_PROTOCOLS.has(protocol)) {
    throw new Error(
      `OpenTelemetry MCP SDK mode in runtime-daemon uses the OTLP HTTP/JSON exporter; got protocol="${protocol}"`,
    );
  }
}

function resourceAttributesFromPlan(plan: McpOtelRecorderPlan): Record<string, string | number | boolean> {
  return {
    ...plan.defaultAttributes,
    [SERVICE_NAME_KEY]:
      plan.sdk?.serviceName
      ?? stringAttribute(plan.defaultAttributes[SERVICE_NAME_KEY])
      ?? DEFAULT_SERVICE_NAME,
  };
}

function exporterOptionsFromPlan(plan: McpOtelRecorderPlan): ConstructorParameters<typeof OTLPTraceExporter>[0] {
  const otlp = plan.sdk?.otlp;
  return {
    ...(otlp?.tracesEndpoint !== undefined
      ? { url: otlp.tracesEndpoint }
      : otlp?.endpoint !== undefined
        ? { url: otlp.endpoint }
        : {}),
    ...(otlp?.tracesTimeoutMs !== undefined
      ? { timeoutMillis: otlp.tracesTimeoutMs }
      : otlp?.timeoutMs !== undefined
        ? { timeoutMillis: otlp.timeoutMs }
        : {}),
  };
}

function stringAttribute(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
