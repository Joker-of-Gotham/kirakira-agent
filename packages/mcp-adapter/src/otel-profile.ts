import {
  ExportingMcpSpanRecorder,
  InMemoryMcpSpanExporter,
  OpenTelemetryMcpSpanRecorder,
  type McpSpanAttributes,
  type McpSpanExporter,
  type McpSpanRecorder,
  type OpenTelemetryApiLike,
} from "./otel-bridge.js";

export const MCP_OTEL_ENV = {
  mode: "KIRAKIRA_MCP_OTEL_MODE",
  tracerName: "KIRAKIRA_MCP_OTEL_TRACER_NAME",
  tracerVersion: "KIRAKIRA_MCP_OTEL_TRACER_VERSION",
  serviceName: "OTEL_SERVICE_NAME",
  tracesExporter: "OTEL_TRACES_EXPORTER",
  otlpEndpoint: "OTEL_EXPORTER_OTLP_ENDPOINT",
  otlpTracesEndpoint: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  otlpProtocol: "OTEL_EXPORTER_OTLP_PROTOCOL",
  otlpTracesProtocol: "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL",
  otlpTimeout: "OTEL_EXPORTER_OTLP_TIMEOUT",
  otlpTracesTimeout: "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT",
} as const;

export type McpOtelRecorderMode =
  | "off"
  | "memory"
  | "opentelemetry-api"
  | "opentelemetry-sdk";

export interface McpOtelSdkOtlpConfiguration {
  endpoint?: string;
  tracesEndpoint?: string;
  protocol?: string;
  tracesProtocol?: string;
  timeoutMs?: number;
  tracesTimeoutMs?: number;
}

export interface McpOtelSdkConfiguration {
  serviceName?: string;
  tracesExporter?: string;
  otlp?: McpOtelSdkOtlpConfiguration;
}

export interface McpOtelRecorderPlan {
  schemaVersion: 1;
  source: "runtime-profile.mcp.otel";
  enabled: boolean;
  mode: McpOtelRecorderMode;
  tracerName: string;
  tracerVersion?: string;
  defaultAttributes: McpSpanAttributes;
  sdk?: McpOtelSdkConfiguration;
}

export interface McpOtelRuntimeProfileLike {
  name?: string;
  mode?: string;
  telemetry?: unknown;
  mcp?: unknown;
}

export interface BuildMcpOtelRecorderPlanOptions {
  profile?: McpOtelRuntimeProfileLike;
  env?: Record<string, string | undefined>;
  defaultTracerName?: string;
  defaultTracerVersion?: string;
  defaultAttributes?: McpSpanAttributes;
}

export interface McpOtelRecorderFactoryOptions {
  plan: McpOtelRecorderPlan;
  api?: OpenTelemetryApiLike;
  exporter?: McpSpanExporter;
  sdkFactory?: McpOtelSdkFactory;
}

export interface McpOtelRecorderFactoryResult {
  plan: McpOtelRecorderPlan;
  recorder?: McpSpanRecorder;
  exporter?: InMemoryMcpSpanExporter;
  shutdown?: () => void | Promise<void>;
}

export interface McpOtelSdkFactoryOptions {
  plan: McpOtelRecorderPlan;
}

export interface McpOtelSdkFactoryResult {
  api: OpenTelemetryApiLike;
  shutdown?: () => void | Promise<void>;
}

export type McpOtelSdkFactory = (
  options: McpOtelSdkFactoryOptions,
) => McpOtelSdkFactoryResult;

const DEFAULT_TRACER_NAME = "kirakira.mcp";
const DEFAULT_SERVICE_NAME = "kirakira-agent";

export function buildMcpOtelRecorderPlan(
  options: BuildMcpOtelRecorderPlanOptions = {},
): McpOtelRecorderPlan {
  const env = options.env ?? process.env;
  const telemetry = objectRecord(options.profile?.telemetry);
  const mcp = objectRecord(options.profile?.mcp);
  const mcpTelemetry = objectRecord(mcp.telemetry);
  const mode = recorderMode(
    env[MCP_OTEL_ENV.mode]
      ?? stringValue(mcpTelemetry.mode)
      ?? stringValue(telemetry.mcpMode)
      ?? stringValue(telemetry.mode),
    booleanValue(mcpTelemetry.enabled ?? telemetry.otel),
  );
  const configuredServiceName = nonEmptyString(env[MCP_OTEL_ENV.serviceName])
    ?? stringValue(mcpTelemetry.serviceName)
    ?? stringValue(telemetry.serviceName);
  const serviceName = configuredServiceName ?? DEFAULT_SERVICE_NAME;
  return {
    schemaVersion: 1,
    source: "runtime-profile.mcp.otel",
    enabled: mode !== "off",
    mode,
    tracerName: nonEmptyString(env[MCP_OTEL_ENV.tracerName])
      ?? stringValue(mcpTelemetry.tracerName)
      ?? options.defaultTracerName
      ?? DEFAULT_TRACER_NAME,
    ...(nonEmptyString(env[MCP_OTEL_ENV.tracerVersion])
      ?? stringValue(mcpTelemetry.tracerVersion)
      ?? options.defaultTracerVersion) !== undefined
      ? {
          tracerVersion: nonEmptyString(env[MCP_OTEL_ENV.tracerVersion])
            ?? stringValue(mcpTelemetry.tracerVersion)
            ?? options.defaultTracerVersion,
        }
      : {},
    defaultAttributes: {
      "service.name": serviceName,
      ...(options.profile?.name !== undefined ? { "kirakira.runtime.profile": options.profile.name } : {}),
      ...(options.profile?.mode !== undefined ? { "kirakira.runtime.mode": options.profile.mode } : {}),
      ...(options.defaultAttributes ?? {}),
    },
    ...(mode === "opentelemetry-sdk"
      ? { sdk: sdkConfiguration(env, telemetry, mcpTelemetry, configuredServiceName) }
      : {}),
  };
}

export function createMcpOtelRecorderFromPlan(
  options: McpOtelRecorderFactoryOptions,
): McpOtelRecorderFactoryResult {
  if (!options.plan.enabled || options.plan.mode === "off") {
    return { plan: options.plan };
  }
  if (options.plan.mode === "memory") {
    const exporter = options.exporter ?? new InMemoryMcpSpanExporter();
    return {
      plan: options.plan,
      recorder: new ExportingMcpSpanRecorder(exporter),
      ...(exporter instanceof InMemoryMcpSpanExporter ? { exporter } : {}),
    };
  }
  if (options.plan.mode === "opentelemetry-sdk") {
    if (options.sdkFactory === undefined) {
      throw new Error(
        "OpenTelemetry MCP recorder plan mode \"opentelemetry-sdk\" requires an injected OpenTelemetry SDK/OTLP exporter factory; configure the runtime with @opentelemetry/sdk-node and an OTLP trace exporter factory, or select \"opentelemetry-api\" and provide an API adapter",
      );
    }
    const sdk = options.sdkFactory({ plan: options.plan });
    return {
      plan: options.plan,
      recorder: new OpenTelemetryMcpSpanRecorder({
        api: sdk.api,
        tracerName: options.plan.tracerName,
        tracerVersion: options.plan.tracerVersion,
        defaultAttributes: options.plan.defaultAttributes,
      }),
      ...(sdk.shutdown !== undefined ? { shutdown: sdk.shutdown } : {}),
    };
  }
  if (options.api === undefined) {
    throw new Error("OpenTelemetry MCP recorder plan requires an OpenTelemetry API adapter");
  }
  return {
    plan: options.plan,
    recorder: new OpenTelemetryMcpSpanRecorder({
      api: options.api,
      tracerName: options.plan.tracerName,
      tracerVersion: options.plan.tracerVersion,
      defaultAttributes: options.plan.defaultAttributes,
    }),
  };
}

function recorderMode(value: string | undefined, enabled: boolean | undefined): McpOtelRecorderMode {
  if (value === "memory" || value === "opentelemetry-api" || value === "off") return value;
  if (value === "opentelemetry-sdk" || value === "otel-sdk" || value === "otlp") {
    return "opentelemetry-sdk";
  }
  return enabled ? "opentelemetry-api" : "off";
}

function sdkConfiguration(
  env: Record<string, string | undefined>,
  telemetry: Record<string, unknown>,
  mcpTelemetry: Record<string, unknown>,
  serviceName: string | undefined,
): McpOtelSdkConfiguration {
  const sdk = objectRecord(mcpTelemetry.sdk);
  const exporter = objectRecord(mcpTelemetry.exporter);
  const otlp = objectRecord(mcpTelemetry.otlp ?? sdk.otlp ?? exporter.otlp);
  return compactSdkConfiguration({
    serviceName,
    tracesExporter: nonEmptyString(env[MCP_OTEL_ENV.tracesExporter])
      ?? stringValue(sdk.tracesExporter)
      ?? stringValue(exporter.traces)
      ?? stringValue(exporter.type)
      ?? stringValue(telemetry.tracesExporter),
    otlp: compactOtlpConfiguration({
      endpoint: nonEmptyString(env[MCP_OTEL_ENV.otlpEndpoint]) ?? stringValue(otlp.endpoint),
      tracesEndpoint: nonEmptyString(env[MCP_OTEL_ENV.otlpTracesEndpoint])
        ?? stringValue(otlp.tracesEndpoint)
        ?? stringValue(otlp.traces_endpoint),
      protocol: nonEmptyString(env[MCP_OTEL_ENV.otlpProtocol]) ?? stringValue(otlp.protocol),
      tracesProtocol: nonEmptyString(env[MCP_OTEL_ENV.otlpTracesProtocol])
        ?? stringValue(otlp.tracesProtocol)
        ?? stringValue(otlp.traces_protocol),
      timeoutMs: integerValue(env[MCP_OTEL_ENV.otlpTimeout]) ?? integerValue(otlp.timeoutMs),
      tracesTimeoutMs: integerValue(env[MCP_OTEL_ENV.otlpTracesTimeout])
        ?? integerValue(otlp.tracesTimeoutMs),
    }),
  });
}

function compactSdkConfiguration(config: McpOtelSdkConfiguration): McpOtelSdkConfiguration {
  return {
    ...(config.serviceName !== undefined ? { serviceName: config.serviceName } : {}),
    ...(config.tracesExporter !== undefined ? { tracesExporter: config.tracesExporter } : {}),
    ...(config.otlp !== undefined ? { otlp: config.otlp } : {}),
  };
}

function compactOtlpConfiguration(
  config: McpOtelSdkOtlpConfiguration,
): McpOtelSdkOtlpConfiguration | undefined {
  const compact = {
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
    ...(config.tracesEndpoint !== undefined ? { tracesEndpoint: config.tracesEndpoint } : {}),
    ...(config.protocol !== undefined ? { protocol: config.protocol } : {}),
    ...(config.tracesProtocol !== undefined ? { tracesProtocol: config.tracesProtocol } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.tracesTimeoutMs !== undefined ? { tracesTimeoutMs: config.tracesTimeoutMs } : {}),
  };
  return Object.keys(compact).length > 0 ? compact : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nonEmptyString(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function integerValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
