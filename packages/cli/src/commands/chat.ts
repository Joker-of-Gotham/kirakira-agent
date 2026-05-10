import { Command, Flags } from "@oclif/core";
import { basename } from "node:path";
import { loadConfig } from "../config/loader.js";
import type { ProviderConfig } from "../gateway/openai-complete.js";
import { resolveLlmRuntimeEnv } from "../gateway/openai-complete.js";
import type { ModelProviderDecl } from "@kirakira/core";
import { loadTuiConfig } from "../tui/config.js";
import type { TuiConfig } from "../tui/config.js";

/**
 * Resolve model + provider config from the agent.toml `[model]` section.
 *
 * Priority:
 *   1. agent.toml provider whose `models` or `default_model` matches
 *   2. First provider with a `base_url` (as generic fallback)
 *   3. Environment variables (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
 */
function resolveProviderFromToml(
  modelName: string,
  providers: ModelProviderDecl[],
): ProviderConfig {
  const env = resolveLlmRuntimeEnv();

  if (!providers || providers.length === 0) {
    return { ...env, defaultModel: modelName || env.defaultModel };
  }

  const matchByModel = providers.find(
    (p) =>
      p.default_model === modelName ||
      (p.models && p.models.includes(modelName)),
  );
  const provider = matchByModel ?? providers[0]!;

  const apiKeyEnv = provider.api_key_env;
  const apiKey = apiKeyEnv
    ? (process.env[apiKeyEnv] ?? "EMPTY").trim()
    : env.apiKey;

  return {
    baseUrl: (provider.base_url ?? env.baseUrl).replace(/\/$/, ""),
    apiKey,
    defaultModel: modelName || provider.default_model || env.defaultModel,
  };
}

export default class Chat extends Command {
  static override description =
    "Interactive multi-turn chat with the LLM (default when no subcommand is given)";

  static override flags = {
    config: Flags.string({
      char: "c",
      description: "Path to agent.toml",
    }),
    "no-tui": Flags.boolean({
      description: "Force readline fallback even if TTY is available",
      default: false,
    }),
    "tui-config": Flags.string({
      description: "Path to tui.json/jsonc",
    }),
    theme: Flags.string({
      description: "Override TUI theme name",
    }),
    "no-mouse": Flags.boolean({
      description: "Disable mouse interactions in TUI",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Chat);
    const cwd = process.cwd();

    const resolved = await loadConfig({
      configPath: flags.config,
      workspaceRoot: cwd,
    });

    const modelSection = resolved.agentToml.model;
    const modelName = modelSection?.default ?? resolveLlmRuntimeEnv().defaultModel;
    const providerConfig = resolveProviderFromToml(
      modelName,
      modelSection?.providers ?? [],
    );

    const workspaceName = resolved.agentToml.workspace_name ?? basename(cwd);
    const trust = String(resolved.policyYaml.workspaceTrust ?? "untrusted");
    const loadedTui = loadTuiConfig({
      workspaceRoot: cwd,
      explicitPath: flags["tui-config"],
      themeOverride: flags.theme,
      noMouse: flags["no-mouse"],
    });

    for (const warn of loadedTui.warnings) {
      this.warn(warn);
    }

    const isTty = process.stdin.isTTY === true && !flags["no-tui"];

    if (isTty) {
      await this.runInkTui(providerConfig, workspaceName, cwd, trust, loadedTui.config);
    } else {
      await this.runReadlineFallback(providerConfig, workspaceName, cwd);
    }
  }

  private async runInkTui(
    providerConfig: ProviderConfig,
    workspaceName: string,
    workspaceRoot: string,
    trust: string,
    tuiConfig: TuiConfig,
  ): Promise<void> {
    process.env.FORCE_COLOR ??= "3";
    process.env.COLORTERM ??= "truecolor";
    process.env.TERM ??= "xterm-256color";
    if (process.env.KIRAKIRA_ALLOW_NO_COLOR !== "1") {
      delete process.env.NO_COLOR;
    }

    const { render } = await import("ink");
    const React = await import("react");
    const { App } = await import("../tui/App.js");

    const { waitUntilExit } = render(
      React.createElement(App, {
        initialModel: providerConfig.defaultModel,
        initialMode: "agent" as const,
        workspaceName,
        workspaceRoot,
        trust,
        tuiConfig,
        providerConfig,
      }),
      // Keep animation and status refreshes inside one frame-buffered terminal surface.
      { exitOnCtrlC: true, alternateScreen: true },
    );

    await waitUntilExit();
  }

  private async runReadlineFallback(
    providerConfig: ProviderConfig,
    _workspaceName: string,
    workspaceRoot: string,
  ): Promise<void> {
    const { createInterface } = await import("node:readline");
    const chalk = (await import("chalk")).default;
    const { chatCompleteMultiTurn } = await import("../gateway/openai-complete.js");

    this.log("");
    this.log(chalk.bold.cyan("kirakira-agent (pipe mode)"));
    this.log(chalk.dim(`workspace: ${workspaceRoot}`));
    this.log(chalk.dim(`model: ${providerConfig.defaultModel}`));
    this.log(chalk.dim(`endpoint: ${providerConfig.baseUrl}`));
    this.log("");

    const messages: Array<{ role: string; content: string }> = [];

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    for await (const line of rl) {
      const text = line.replace(/\r$/, "").trim();
      if (!text) continue;

      if (text.startsWith("/quit") || text.startsWith("/exit")) break;

      messages.push({ role: "user", content: text });
      try {
        const result = await chatCompleteMultiTurn({
          messages,
          model: providerConfig.defaultModel,
          temperature: 0.2,
          maxTokens: 4096,
          provider: providerConfig,
        });
        messages.push({ role: "assistant", content: result.text });
        this.log(result.text);
      } catch (e) {
        messages.pop();
        this.error(e instanceof Error ? e.message : String(e));
      }
    }
  }
}
