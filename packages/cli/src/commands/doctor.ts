import { Command } from "@oclif/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { PATHS } from "@kirakira/core";
import { resolveConfigPaths } from "../config/paths.js";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

export default class Doctor extends Command {
  static override description =
    "Check environment health for kirakira-agent operation";

  async run(): Promise<void> {
    const cwd = process.cwd();
    const results: CheckResult[] = [];

    results.push(this.checkNode());
    results.push(this.checkWorkspaceConfig(cwd));
    results.push(this.checkPolicyConfig(cwd));
    results.push(this.checkMcpConfig(cwd));
    results.push(this.checkSkillsDir(cwd));
    results.push(this.checkUserHome());
    results.push(this.checkPython());
    results.push(this.checkGit());

    this.log("\nkirakira-agent doctor\n");
    for (const r of results) {
      const icon =
        r.status === "ok"
          ? chalk.green("✓")
          : r.status === "warn"
            ? chalk.yellow("⚠")
            : chalk.red("✗");
      this.log(`  ${icon} ${r.name}: ${r.message}`);
    }

    const failCount = results.filter((r) => r.status === "fail").length;
    const warnCount = results.filter((r) => r.status === "warn").length;
    this.log(
      `\n${results.length} checks, ${failCount} failed, ${warnCount} warnings`,
    );
  }

  private checkNode(): CheckResult {
    const version = process.version;
    const major = parseInt(version.slice(1), 10);
    if (major >= 20) {
      return { name: "Node.js", status: "ok", message: version };
    }
    return {
      name: "Node.js",
      status: "fail",
      message: `${version} (requires >=20)`,
    };
  }

  private checkWorkspaceConfig(cwd: string): CheckResult {
    const p = join(cwd, PATHS.workspaceConfig);
    if (existsSync(p)) {
      return { name: "agent.toml", status: "ok", message: "found" };
    }
    return {
      name: "agent.toml",
      status: "warn",
      message: "not found. Run 'kirakira-agent init'",
    };
  }

  private checkPolicyConfig(cwd: string): CheckResult {
    const p = join(cwd, PATHS.workspacePolicy);
    if (existsSync(p)) {
      return { name: "policy.yaml", status: "ok", message: "found" };
    }
    return {
      name: "policy.yaml",
      status: "warn",
      message: "not found. Using defaults",
    };
  }

  private checkMcpConfig(cwd: string): CheckResult {
    const p = join(cwd, PATHS.mcpConfig);
    if (existsSync(p)) {
      return { name: ".mcp.json", status: "ok", message: "found" };
    }
    return {
      name: ".mcp.json",
      status: "warn",
      message: "not found",
    };
  }

  private checkSkillsDir(cwd: string): CheckResult {
    const p = join(cwd, ".kirakira", "skills");
    if (existsSync(p)) {
      return { name: "skills directory", status: "ok", message: ".kirakira/skills/" };
    }
    return {
      name: "skills directory",
      status: "warn",
      message: "no .kirakira/skills/ directory",
    };
  }

  private checkUserHome(): CheckResult {
    const paths = resolveConfigPaths(process.cwd());
    if (existsSync(paths.userHome)) {
      return { name: "user home", status: "ok", message: paths.userHome };
    }
    return {
      name: "user home",
      status: "warn",
      message: `${paths.userHome} not created yet`,
    };
  }

  private checkPython(): CheckResult {
    try {
      const { execSync } = require("node:child_process");
      const version = execSync("python3 --version", {
        encoding: "utf-8",
      }).trim();
      return { name: "Python", status: "ok", message: version };
    } catch {
      return {
        name: "Python",
        status: "warn",
        message: "python3 not found (needed for model gateway)",
      };
    }
  }

  private checkGit(): CheckResult {
    try {
      const { execSync } = require("node:child_process");
      const version = execSync("git --version", { encoding: "utf-8" }).trim();
      return { name: "Git", status: "ok", message: version };
    } catch {
      return { name: "Git", status: "warn", message: "git not found" };
    }
  }
}
