import { Command, Flags } from "@oclif/core";
import { createPdpClient } from "@kirakira/policy-engine";

import type { PolicyEvalOptionsTool } from "../../lib/policy-input-build.js";
import { buildCliPolicyInput, resolveWorkspaceRoot } from "../../lib/policy-input-build.js";

export interface PolicyEvalOptions {
  tool: string;
  cmd?: string;
  args?: string[];
  json?: boolean;
  workspaceRoot?: string;
}

export async function policyEval(options: PolicyEvalOptions): Promise<void> {
  const input = buildCliPolicyInput({
    tool: options.tool as PolicyEvalOptionsTool,
    cmd: options.cmd,
    args: options.args,
    workspaceRoot: options.workspaceRoot ?? resolveWorkspaceRoot(),
  });

  const pdp = await createPdpClient();
  try {
    const decision = await pdp.evaluate(input);
    const payload =
      options.json ?? false
        ? JSON.stringify(decision, null, 2)
        : `${decision.effect} — ${decision.explain.summary}\n` +
          `decision_id: ${decision.decision_id}\n` +
          `matched: ${decision.explain.matched_rules.join(", ")}`;

    console.log(payload);
  } finally {
    await pdp.close();
  }
}

export default class PolicyEvalCmd extends Command {
  static override description = "Dry-run a PDP evaluation for a synthesized policy input";

  static override flags = {
    tool: Flags.string({
      char: "t",
      description: 'Normalized tool facet (`shell`|`mcp`|`file`|`model`|`registry`, …)',
      required: true,
    }),
    cmd: Flags.string({ description: "Primary executable / MCP verb" }),
    args: Flags.string({
      multiple: true,
      description: "Additional positional tokens (repeat --args)",
    }),
    json: Flags.boolean({ description: "Emit structured JSON", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PolicyEvalCmd);
    const chunks = typeof flags.args === "string" ? [flags.args] : (flags.args ?? []);
    const argList = chunks.flatMap((chunk) =>
      `${chunk}`
        .split(/[\s,]+/gu)
        .map((x) => x.trim())
        .filter(Boolean),
    );

    await policyEval({
      tool: String(flags.tool),
      cmd: flags.cmd,
      args: argList.length > 0 ? argList : undefined,
      json: flags.json ?? false,
    });
  }
}
