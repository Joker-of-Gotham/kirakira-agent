import { Command } from "@oclif/core";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Default interactive entry: version banner + workspace + next steps.
 * Run `kirakira-agent` with no arguments to land here (see `bin/run.js`).
 */
export default class Preview extends Command {
  static override description =
    "Preview: version, workspace path, and suggested commands (also the default when no subcommand is given)";

  async run(): Promise<void> {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "..", "package.json");
    let version = "0.1.0";
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
      version = pkg.version ?? version;
    } catch {
      // built artifact layout may differ; keep fallback version
    }

    const cwd = process.cwd();
    this.log("");
    this.log(chalk.bold.cyan(`kirakira-agent ${version}`));
    this.log(chalk.dim(`workspace: ${cwd}`));
    this.log("");
    this.log(chalk.bold("Try"));
    this.log(`  ${chalk.green("kirakira-agent doctor")}          Environment & config checks`);
    this.log(`  ${chalk.green("kirakira-agent init")}           Scaffold agent.toml, policy.yaml, .mcp.json`);
    this.log(`  ${chalk.green("kirakira-agent exec -p \"hi\"")} One-shot non-interactive run`);
    this.log(`  ${chalk.green("kirakira-agent completion bash")} Shell completions`);
    this.log("");
    this.log(
      chalk.dim(
        "Python model gateway: packages/model-gateway — run JSON-RPC stdio server via `kirakira-model-gateway` after install.",
      ),
    );
    this.log("");
  }
}
