import type {
  AgentMcpOtelMetadata,
  AgentMcpToolCallRequest,
  AgentMcpToolCallResult,
  AgentMcpToolGateway,
  AgentMcpToolPolicyResult,
} from "@kirakira/agent-runtime";
import type {
  RuntimeMcpOtelMetadata,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  RuntimeMcpToolPolicyResult,
} from "@kirakira/runtime-contracts";

export type DaemonMcpGatewayCallInput = RuntimeMcpToolCallRequest & {
  runtimeProfileName?: string;
};

export interface DaemonMcpToolCallRuntime {
  callTool(input: DaemonMcpGatewayCallInput): Promise<RuntimeMcpToolCallResult>;
}

function policyFromRuntime(policy: RuntimeMcpToolPolicyResult): AgentMcpToolPolicyResult {
  return {
    effect: policy.effect,
    reasonCodes: policy.reasonCodes,
    approvalRequired: policy.approvalRequired,
    traceId: policy.traceId,
    ...(policy.decisionId !== undefined ? { decisionId: policy.decisionId } : {}),
    ...(policy.summary !== undefined ? { summary: policy.summary } : {}),
  };
}

function otelFromRuntime(otel: RuntimeMcpOtelMetadata): AgentMcpOtelMetadata {
  return {
    spanName: otel.spanName,
    attributes: otel.attributes,
    ...(otel.traceId !== undefined ? { traceId: otel.traceId } : {}),
    ...(otel.spanId !== undefined ? { spanId: otel.spanId } : {}),
    ...(otel.parentSpanId !== undefined ? { parentSpanId: otel.parentSpanId } : {}),
    ...(otel.traceContext !== undefined ? { traceContext: otel.traceContext } : {}),
    ...(otel.status !== undefined ? { status: otel.status } : {}),
    ...(otel.durationMs !== undefined ? { durationMs: otel.durationMs } : {}),
  };
}

function requestForDaemonRuntime(request: AgentMcpToolCallRequest): DaemonMcpGatewayCallInput {
  return {
    server: request.server,
    tool: request.tool,
    ...(request.arguments !== undefined ? { arguments: request.arguments } : {}),
    ...(request.runId !== undefined ? { runId: request.runId } : {}),
    ...(request.traceId !== undefined ? { traceId: request.traceId } : {}),
    ...(request.traceContext !== undefined ? { traceContext: request.traceContext } : {}),
    ...(request.subagentId !== undefined ? { subagentId: request.subagentId } : {}),
    ...(request.role !== undefined ? { role: request.role } : {}),
    ...(request.requestedLane !== undefined ? { requestedLane: request.requestedLane } : {}),
    ...(request.runtimeProfileName !== undefined
      ? { runtimeProfileName: request.runtimeProfileName }
      : {}),
  };
}

function resultFromDaemonRuntime(result: RuntimeMcpToolCallResult): AgentMcpToolCallResult {
  return {
    server: result.server,
    tool: result.tool,
    success: result.success,
    ...(result.content !== undefined ? { content: result.content } : {}),
    ...(result.structuredContent !== undefined
      ? { structuredContent: result.structuredContent }
      : {}),
    ...(result.isError !== undefined ? { isError: result.isError } : {}),
    ...(result.error !== undefined ? { error: result.error } : {}),
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
    policy: policyFromRuntime(result.policy),
    ...(result.trust !== undefined ? { trust: { ...result.trust } } : {}),
    ...(result.audit !== undefined ? { audit: { ...result.audit } } : {}),
    ...(result.otel !== undefined ? { otel: otelFromRuntime(result.otel) } : {}),
  };
}

export class DaemonAgentMcpToolGateway implements AgentMcpToolGateway {
  constructor(private readonly runtime: DaemonMcpToolCallRuntime) {}

  async callTool(request: AgentMcpToolCallRequest): Promise<AgentMcpToolCallResult> {
    return resultFromDaemonRuntime(
      await this.runtime.callTool(requestForDaemonRuntime(request)),
    );
  }
}

export function createDaemonAgentMcpToolGateway(
  runtime: DaemonMcpToolCallRuntime,
): AgentMcpToolGateway {
  return new DaemonAgentMcpToolGateway(runtime);
}
