import type { ApprovalKind } from "@kirakira/core";
import type { z } from "zod";
import { policyYamlSchema } from "@kirakira/core";
import { isShellAllowed } from "./policy-matcher.js";
import type { SessionAllowlist } from "./session-allowlist.js";

export type PolicyConfig = z.infer<typeof policyYamlSchema>;

export type ActionDescriptor =
  | {
      kind: "shell";
      command: string;
      scope: "workspace" | "host";
      sandbox: string;
      risk: string;
      requestedBy: string;
    }
  | {
      kind: "mcp";
      server: string;
      transport: string;
      tool: string;
      url?: string;
      dataClass?: string;
      oauthScope?: string;
    }
  | {
      kind: "write";
      path: string;
      operation: "create" | "modify" | "delete";
      preview?: string;
    };

export interface ApprovalEvaluation {
  required: boolean;
  kind?: ApprovalKind;
  reason?: string;
}

export function evaluateApprovalNeeded(
  action: ActionDescriptor,
  policy: PolicyConfig | undefined,
  sessionAllowlist: SessionAllowlist | undefined,
): ApprovalEvaluation {
  switch (action.kind) {
    case "shell": {
      if (sessionAllowlist?.matches(action.command, "shell")) {
        return { required: false, reason: "session_allowlist" };
      }

      const shell = policy?.shell;
      if (action.scope === "host") {
        const host = shell?.hostExecution ?? "ask";
        if (host === "deny") {
          return { required: true, kind: "shell", reason: "host_denied" };
        }
        if (host === "allow") {
          return { required: false, reason: "host_allowed" };
        }
        return { required: true, kind: "shell", reason: "host_requires_approval" };
      }

      const { allowed, denyHit, allowHit } = isShellAllowed(
        action.command,
        shell?.allowlist,
        shell?.denylist,
      );

      if (denyHit) {
        return { required: true, kind: "shell", reason: "denylist" };
      }

      if (shell?.allowlist?.length && !allowHit) {
        return { required: true, kind: "shell", reason: "not_on_allowlist" };
      }

      if (!allowed) {
        return { required: true, kind: "shell", reason: "policy" };
      }

      return { required: false, reason: "shell_allowed" };
    }

    case "mcp": {
      const mcp = policy?.mcp;
      const approved = mcp?.approvedServers?.includes(action.server);
      if (approved) return { required: false, reason: "mcp_server_preapproved" };
      if (mcp?.allowRemoteHttp === false && action.transport === "http") {
        return { required: true, kind: "mcp", reason: "remote_http_disabled" };
      }
      return { required: true, kind: "mcp", reason: "mcp_default_ask" };
    }

    case "write": {
      if (policy?.workspaceTrust === "trusted") {
        return { required: false, reason: "trusted_workspace" };
      }
      return { required: true, kind: "write", reason: "write_requires_approval" };
    }
  }
}
