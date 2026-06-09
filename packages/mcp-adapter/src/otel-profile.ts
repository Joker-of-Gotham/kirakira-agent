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
} as const;

export type McpOtelRecorderMode = "off" | "memory" | "opentelemetry-api";

export interface McpOtelRecorderPlan {
  schemaVersion: 1;
  source: "runtime-profile.mcp.otel";
  enabled: boolean;
  mode: McpOtelRecorderMode;
  tracerName: string;
  tracerVersion?: string;
  defaultAttributes: McpSpanAttributes;
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
}

export interface McpOtelRecorderFactoryResult {
  plan: McpOtelRecorderPlan;
  recorder?: McpSpanRecorder;
  exporter?: InMemoryMcpSpanExporter;
}

const DEFAULT_TRACER_NAME = "kirakira.mcp";

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
  const serviceName = nonEmptyString(env[MCP_OTEL_ENV.serviceName]) ?? "kirakira-agent";
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
  return enabled ? "opentelemetry-api" : "off";
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
