import { Command } from "@oclif/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "../../util/repo-root.js";

export default class EvalList extends Command {
  static override description = "List evaluation suite targets for `kirakira-agent eval run`";

  async run(): Promise<void> {
    const root = findRepoRoot();
    const lines: string[] = [];

    if (existsSync(join(root, "pnpm-workspace.yaml"))) {
      lines.push("Monorepo root: " + root);
    } else {
      lines.push("No pnpm-workspace.yaml found upward from cwd; using: " + root);
    }

    const vitestConfigs = [
      join(root, "vitest.config.ts"),
      join(root, "vitest.config.mts"),
      join(root, "packages/cli/vitest.config.ts"),
    ];
    const vitestOk = vitestConfigs.some((p) => existsSync(p));
    lines.push(
      vitestOk
        ? "TypeScript (Vitest): configured — `kirakira-agent eval run --suite ts`"
        : "TypeScript (Vitest): no vitest.config found at common paths",
    );

    const pyDir = join(root, "test/unit/model-gateway");
    lines.push(
      existsSync(pyDir)
        ? `Python (pytest): ${pyDir} — \`kirakira-agent eval run --suite py\``
        : `Python (pytest): missing ${pyDir}`,
    );

    lines.push("Combined: `kirakira-agent eval run --suite full` (Vitest + pytest when present)");

    for (const l of lines) {
      this.log(l);
    }
  }
}
