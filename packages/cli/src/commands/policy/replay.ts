import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import { Args, Command, Flags } from "@oclif/core";
import type { ActionKind, AuditEvent, PolicyInput, ToolType } from "@kirakira/core";
import { createPdpClient, normalizeShellCommand } from "@kirakira/policy-engine";
import { getAuditLedgerDir } from "@kirakira/audit-ledger";

import { scanFindEvent } from "../../lib/ledger-utils.js";
import { resolveWorkspaceRoot } from "../../lib/policy-input-build.js";

export interface PolicyReplayOptions {
  auditEventId: string;
  json?: boolean;
  workspaceRoot?: string;
}

function guessAction(ev: AuditEvent): {
  kind: ActionKind;
  tool_type: ToolType;
  tool_name: string;
  operation: string;
} {
  const subjectType = ev.subject.tool_type;
  if (subjectType === "shell" || ev.subject.command_base)
    return { kind: "shell.exec", tool_type: "shell", tool_name: "bash", operation: "replay" };
  if (subjectType === "mcp")
    return { kind: "tool.call", tool_type: "mcp", tool_name: ev.subject.mcp_server_id ?? "mcp", operation: "replay" };
  if (subjectType === "file")
    return { kind: "file.write", tool_type: "file", tool_name: "filesystem", operation: "replay" };
  if (subjectType === "model")
    return { kind: "model.invoke", tool_type: "model", tool_name: ev.subject.model_name ?? "llm", operation: "replay" };
  return { kind: "tool.call", tool_type: "shell", tool_name: "unknown", operation: "replay" };
}

function buildReplayInput(ev: AuditEvent, workspaceRoot: string): PolicyInput {
  const ws = resolveWorkspaceRoot(workspaceRoot);
  const slug = basename(ws.replace(/[/\\]+$/, "")) || "default";
  const action = guessAction(ev);
  const commandLine = ev.subject.command_base ?? "pwd";

  const normalized =
    action.kind === "shell.exec"
      ? (() => {
          const shell = normalizeShellCommand(commandLine, ws);
          return {
            flags: shell.flags,
            subcommands: shell.subcommands,
            write_paths: shell.writePaths,
            read_paths: shell.readPaths,
            network:
              shell.networkDomains.length > 0
                ? {
                    required: false,
                    domains: [...new Set(shell.networkDomains)],
                    ...(shell.networkProtocol !== undefined ? { protocol: shell.networkProtocol } : {}),
                  }
                : undefined,
            destructive: shell.destructive,
            interpreter_handoff: shell.interpreterHandoff,
            pipeline_depth: shell.pipelineDepth,
            redirection_targets: shell.redirectionTargets,
            ...(shell.commandBase ? { command_base: shell.commandBase } : {}),
          };
        })()
      : {
          flags: [],
          subcommands: [],
          write_paths: [],
          read_paths: [],
          destructive: false,
          interpreter_handoff: false,
          pipeline_depth: 0,
          redirection_targets: [],
        };

  return {
    version: "kirakira.policyinput.v1",
    request_id: randomUUID(),
    session_id: `replay-${randomUUID().slice(0, 8)}`,
    trace_id: ev.trace_id,
    timestamp: new Date().toISOString(),
    principal: {
      user_id: ev.actor.user_id,
      roles: [],
      authn_method: "token",
      device_trust: "unknown",
      interactive: ev.actor.interactive,
    },
    workspace: {
      workspace_id: slug,
      root: ws,
    },
    action: {
      kind: action.kind,
      tool_type: action.tool_type,
      tool_name: action.tool_name,
      operation: commandLine.slice(0, 128),
      raw: { command: commandLine.split(/\s+/)[0], args: commandLine.split(/\s+/).slice(1) },
      normalized,
    },
    context: {
      mcp_server:
        ev.subject.mcp_server_id !== undefined
          ? {
              id: ev.subject.mcp_server_id,
            }
          : undefined,
      skill:
        ev.subject.skill_id !== undefined
          ? {
              id: ev.subject.skill_id,
            }
          : undefined,
    },
  };
}

export async function policyReplay(options: PolicyReplayOptions): Promise<void> {
  const ledger = getAuditLedgerDir();
  const ev = await scanFindEvent(ledger, options.auditEventId);
  if (!ev) throw new Error(`audit event ${options.auditEventId} not found under ${ledger}`);

  const input = buildReplayInput(ev, options.workspaceRoot ?? process.cwd());

  const pdp = await createPdpClient();
  try {
    const freshDecision = await pdp.evaluate(input);
    const replay = {
      original_event_id: ev.event_id,
      original_decision_id: ev.decision_id,
      original_effect: ev.result.effect,
      original_reason_codes: ev.result.reason_codes ?? [],
      synthetic_input: options.json ?? false ? input : undefined,
      replayed_effect: freshDecision.effect,
      replayed_reason_codes: freshDecision.reason_codes,
      replayed_decision_id: freshDecision.decision_id,
      explain_summary: freshDecision.explain.summary,
      matched_rules: freshDecision.explain.matched_rules,
    };

    if (options.json ?? false) console.log(JSON.stringify(replay, null, 2));
    else {
      console.log(`Replayed PDP decision for audit event ${ev.event_id}`);
      console.log(`Historical effect: ${ev.result.effect ?? "n/a"} → fresh: ${freshDecision.effect}`);
      console.log(JSON.stringify(freshDecision, null, 2));
    }
  } finally {
    await pdp.close();
  }
}

export default class PolicyReplayCmd extends Command {
  static override description = "Re-run PDP evaluation for a persisted audit ledger event";

  static override flags = {
    json: Flags.boolean({
      description: "Emit JSON + synthesized policy replay payload",
      default: false,
    }),
  };

  static override args = {
    eventId: Args.string({ description: "Audit event_id", required: true }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PolicyReplayCmd);
    await policyReplay({
      auditEventId: args.eventId,
      json: flags.json ?? false,
    });
  }
}
