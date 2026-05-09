import { Command, Flags, Args } from "@oclif/core";
import { generateSessionId, generateTraceId } from "@kirakira/core";
import type { ExecResult } from "@kirakira/core";
import { loadConfig } from "../config/loader.js";
import { chatComplete } from "../gateway/openai-complete.js";

const BASE_INPUT_RATE = 0.15 / 1_000_000;
const BASE_OUTPUT_RATE = 0.60 / 1_000_000;

function estimateExecCost(promptTokens: number, completionTokens: number): number {
  return Math.round((promptTokens * BASE_INPUT_RATE + completionTokens * BASE_OUTPUT_RATE) * 1e6) / 1e6;
}

export default class Exec extends Command {
  static override description =
    "Execute a single prompt non-interactively (CI/script mode)";

  static override flags = {
    prompt: Flags.string({
      char: "p",
      description: "Prompt text to execute",
    }),
    model: Flags.string({
      char: "m",
      description: "Model to use (overrides agent.toml / LLM_MODEL)",
    }),
    json: Flags.boolean({
      description: "Output as single JSON object",
      default: false,
      exclusive: ["jsonl"],
    }),
    jsonl: Flags.boolean({
      description: "Output as JSONL event stream",
      default: false,
      exclusive: ["json"],
    }),
    config: Flags.string({
      char: "c",
      description: "Path to agent.toml",
    }),
    timeout: Flags.integer({
      description: "Timeout in seconds for the LLM request",
      default: 300,
    }),
  };

  static override args = {
    prompt: Args.string({ description: "Prompt text (alternative to -p)" }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Exec);
    const prompt = flags.prompt ?? args.prompt;

    if (!prompt) {
      this.error("Prompt required. Use -p or pass as argument.");
    }

    const sessionId = generateSessionId();
    const traceId = generateTraceId();

    const resolved = await loadConfig({
      configPath: flags.config,
      workspaceRoot: process.cwd(),
    });
    const modelFromConfig = resolved.agentToml.model?.default;

    const timeoutMs = (flags.timeout ?? 300) * 1000;
    let completion;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      completion = await Promise.race([
        chatComplete({
          prompt,
          model: flags.model ?? modelFromConfig,
          temperature: 0.2,
          maxTokens: 4096,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Request timed out after ${flags.timeout}s`)), timeoutMs);
          timer.unref();
        }),
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const errResult: ExecResult = {
        sessionId,
        traceId,
        status: "error",
        mode: "exec",
        error: { code: "LLM_ERROR", message },
      };
      if (flags.json) {
        this.log(JSON.stringify(errResult, null, 2));
        this.exit(1);
        return;
      }
      if (flags.jsonl) {
        const now = new Date().toISOString();
        this.log(
          JSON.stringify({ ts: now, event: "session.start", sessionId, traceId }),
        );
        this.log(
          JSON.stringify({
            ts: now,
            event: "error",
            sessionId,
            traceId,
            data: { code: "LLM_ERROR", message },
          }),
        );
        this.exit(1);
        return;
      }
      this.error(message, { exit: 1 });
    }

    const usage = completion.usage;
    const result: ExecResult = {
      sessionId,
      traceId,
      status: "ok",
      mode: "exec",
      result: {
        summary: completion.text,
        artifacts: [],
      },
      usage: {
        tokenIn: usage?.promptTokens ?? 0,
        tokenOut: usage?.completionTokens ?? 0,
        costUsd: estimateExecCost(usage?.promptTokens ?? 0, usage?.completionTokens ?? 0),
        durationMs: completion.durationMs,
      },
    };

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2));
    } else if (flags.jsonl) {
      const now = new Date().toISOString();
      this.log(
        JSON.stringify({ ts: now, event: "session.start", sessionId, traceId }),
      );
      this.log(
        JSON.stringify({
          ts: now,
          event: "session.finish",
          sessionId,
          traceId,
          data: { status: result.status, summary: completion.text },
        }),
      );
    } else {
      this.log(`Session: ${sessionId}`);
      this.log(`Trace: ${traceId}`);
      this.log(`Model: ${completion.model}`);
      this.log(completion.text);
    }

  }
}
