import type { ChainResult, ChainStep, ToolResult } from "../types.js";

import type { ToolExecutor } from "./tool-executor.js";
import type { WorkspaceExecutor } from "../sandbox/workspace-executor.js";

const BATCHABLE = new Set([
  "workspace.readFile",
  "workspace.writeFile",
  "workspace.execShell",
  "workspace.listDir",
]);

function shSingleQuoted(s: string): string {
  return `'${s.replace(/'/g, "'\"'\"'")}'`;
}

function isBatchable(steps: ChainStep[]): boolean {
  return steps.length > 0 && steps.every((s) => BATCHABLE.has(s.toolName));
}

function compileWorkspaceBatch(steps: ChainStep[]): string {
  const lines = ["set -euo pipefail"];
  for (const step of steps) {
    switch (step.toolName) {
      case "workspace.readFile": {
        const p = String(step.args.path ?? "");
        lines.push(`printf '%s\\n' '--- read:${p} ---'`);
        lines.push(`cat ${shSingleQuoted(p)}`);
        break;
      }
      case "workspace.writeFile": {
        const p = String(step.args.path ?? "");
        const content = String(step.args.content ?? "");
        const b64 = Buffer.from(content, "utf8").toString("base64");
        lines.push(`printf '%s' ${shSingleQuoted(b64)} | base64 -d > ${shSingleQuoted(p)}`);
        break;
      }
      case "workspace.execShell": {
        const cmd = String(step.args.command ?? "");
        lines.push(cmd);
        break;
      }
      case "workspace.listDir": {
        const p = String(step.args.path ?? ".");
        lines.push(`printf '%s\\n' '--- list:${p} ---'`);
        lines.push(`ls -la ${shSingleQuoted(p)}`);
        break;
      }
      default:
        break;
    }
  }
  return lines.join("\n");
}

export class ProgrammaticChain {
  constructor(
    private readonly tools: ToolExecutor,
    private readonly workspace?: WorkspaceExecutor,
  ) {}

  async execute(steps: ChainStep[]): Promise<ChainResult> {
    if (this.workspace && isBatchable(steps)) {
      const script = compileWorkspaceBatch(steps);
      return this.executeBatch(script);
    }

    const results: ToolResult[] = [];
    for (const step of steps) {
      const r = await this.tools.execute(step.toolName, step.args);
      results.push(r);
      if (!r.success) {
        return { success: false, results, error: r.error ?? "step_failed" };
      }
    }
    return { success: true, results };
  }

  async executeBatch(script: string, cwd?: string): Promise<ChainResult> {
    if (!this.workspace) {
      return { success: false, results: [], error: "workspace_executor_required" };
    }
    const res = await this.workspace.execShell(script, cwd !== undefined ? { cwd } : undefined);
    const ok = res.exitCode === 0;
    const out: ToolResult = {
      success: ok,
      output: `${res.stdout}\n${res.stderr}`.trim(),
      error: ok ? undefined : `exit:${res.exitCode}`,
    };
    return { success: ok, results: [out], error: ok ? undefined : out.error };
  }
}
