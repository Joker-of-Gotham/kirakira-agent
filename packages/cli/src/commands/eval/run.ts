import { Command, Flags } from "@oclif/core";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "../../util/repo-root.js";

export default class EvalRun extends Command {
  static override description =
    "Run the repository automated test suite (Vitest + pytest)";

  static override flags = {
    suite: Flags.string({
      description:
        "Suite: full | ts | py — full runs Vitest + model-gateway pytest; ts/py run one stack only",
      options: ["full", "ts", "py"],
      default: "full",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EvalRun);
    const root = findRepoRoot();
    if (!existsSync(join(root, "pnpm-workspace.yaml"))) {
      this.error("Could not locate monorepo root (pnpm-workspace.yaml).");
    }

    if (flags.suite === "full" || flags.suite === "ts") {
      this.log("Running Vitest (TypeScript)…");
      execFileSync("pnpm", ["exec", "vitest", "run"], {
        cwd: root,
        stdio: "inherit",
      });
    }

    if (flags.suite === "full" || flags.suite === "py") {
      const pyDir = join(root, "test/unit/model-gateway");
      if (!existsSync(pyDir)) {
        this.error(`Missing ${pyDir}`);
      }
      this.log("Running pytest (model-gateway)…");
      execFileSync("python3", ["-m", "pytest", pyDir, "-v"], {
        cwd: root,
        stdio: "inherit",
      });
    }
  }
}
