import { Command, Flags } from "@oclif/core";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { findRepoRoot } from "../../util/repo-root.js";

interface EvalSummary {
  generatedAt: string;
  root: string;
  vitest?: { ok: boolean; summary: string };
  pytest?: { ok: boolean; summary: string };
}

const CACHE_SEG = join(".kirakira", "eval-last.json");

export default class EvalReport extends Command {
  static override description = "Run tests (or reuse last results) and print a short report";

  static override flags = {
    format: Flags.string({
      description: "Report format",
      options: ["text", "json", "md"],
      default: "text",
    }),
    "no-run": Flags.boolean({
      description: "Do not run tests; read the last cached report from .kirakira/eval-last.json",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EvalReport);
    const root = findRepoRoot();
    const cachePath = join(root, CACHE_SEG);

    let summary: EvalSummary;

    if (flags["no-run"]) {
      if (!existsSync(cachePath)) {
        this.error(`No cache at ${cachePath}. Run without --no-run once.`);
      }
      summary = JSON.parse(await readFile(cachePath, "utf8")) as EvalSummary;
    } else {
      if (!existsSync(join(root, "pnpm-workspace.yaml"))) {
        this.error("Could not locate monorepo root (pnpm-workspace.yaml).");
      }

      summary = {
        generatedAt: new Date().toISOString(),
        root,
      };

      const reportPath = join(root, ".kirakira", "vitest-report.json");
      await mkdir(join(root, ".kirakira"), { recursive: true });

      try {
        await execa("pnpm", ["exec", "vitest", "run", "--reporter=json", `--outputFile=${reportPath}`], {
          cwd: root,
          stdio: "pipe",
        });
        summary.vitest = { ok: true, summary: await readFile(reportPath, "utf8") };
      } catch (e) {
        const err = e as { shortMessage?: string };
        summary.vitest = {
          ok: false,
          summary: err.shortMessage ?? String(e),
        };
      }

      const pyDir = join(root, "test/unit/model-gateway");
      if (existsSync(pyDir)) {
        try {
          const r = await execa("python3", ["-m", "pytest", pyDir, "-q"], {
            cwd: root,
            stdio: "pipe",
          });
          summary.pytest = { ok: true, summary: r.stdout || r.stderr || "ok" };
        } catch (e) {
          const err = e as { stdout?: string; stderr?: string; shortMessage?: string };
          summary.pytest = {
            ok: false,
            summary: err.stdout ?? err.stderr ?? err.shortMessage ?? String(e),
          };
        }
      }

      await writeFile(cachePath, JSON.stringify(summary, null, 2) + "\n", "utf8");
    }

    if (flags.format === "json") {
      this.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (flags.format === "md") {
      const lines = [
        "# Eval report",
        "",
        `- Generated: ${summary.generatedAt}`,
        `- Root: ${summary.root}`,
        "",
      ];
      if (summary.vitest) {
        lines.push(`## Vitest (${summary.vitest.ok ? "ok" : "failed"})`);
        lines.push("```");
        lines.push(
          summary.vitest.ok
            ? "(see JSON cache for full vitest json)"
            : summary.vitest.summary,
        );
        lines.push("```", "");
      }
      if (summary.pytest) {
        lines.push(`## pytest (${summary.pytest.ok ? "ok" : "failed"})`);
        lines.push("```");
        lines.push(summary.pytest.summary);
        lines.push("```", "");
      }
      this.log(lines.join("\n"));
      return;
    }

    this.log(`Eval report (${summary.generatedAt})`);
    this.log(`Root: ${summary.root}`);
    if (summary.vitest) {
      this.log(`Vitest: ${summary.vitest.ok ? "passed" : "FAILED"}`);
      if (!summary.vitest.ok) this.log(summary.vitest.summary);
    }
    if (summary.pytest) {
      this.log(`pytest: ${summary.pytest.ok ? "passed" : "FAILED"}`);
      if (!summary.pytest.ok) this.log(summary.pytest.summary);
    }
    this.log(`\nFull JSON cached at ${cachePath}`);
  }
}
