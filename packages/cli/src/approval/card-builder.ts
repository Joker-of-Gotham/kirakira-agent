import type {
  McpApproval,
  ShellApproval,
  WriteApproval,
} from "@kirakira/core";
import { generateApprovalId } from "@kirakira/core";
import type { ActionDescriptor } from "./evaluator.js";

export function buildShellApprovalCard(
  descriptor: Extract<ActionDescriptor, { kind: "shell" }>,
): { id: string; detail: ShellApproval } {
  return {
    id: generateApprovalId(),
    detail: {
      command: descriptor.command,
      scope: descriptor.scope,
      sandbox: descriptor.sandbox,
      risk: descriptor.risk,
      requestedBy: descriptor.requestedBy,
    },
  };
}

export function buildMcpApprovalCard(
  descriptor: Extract<ActionDescriptor, { kind: "mcp" }>,
): { id: string; detail: McpApproval } {
  return {
    id: generateApprovalId(),
    detail: {
      server: descriptor.server,
      transport: descriptor.transport,
      tool: descriptor.tool,
      url: descriptor.url,
      dataClass: descriptor.dataClass,
      oauthScope: descriptor.oauthScope,
    },
  };
}

export function buildWriteApprovalCard(
  descriptor: Extract<ActionDescriptor, { kind: "write" }>,
): { id: string; detail: WriteApproval } {
  return {
    id: generateApprovalId(),
    detail: {
      path: descriptor.path,
      operation: descriptor.operation,
      preview: descriptor.preview,
    },
  };
}
