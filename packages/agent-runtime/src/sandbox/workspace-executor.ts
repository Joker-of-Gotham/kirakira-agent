import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";

import { isPathWithin } from "@kirakira/core";

import { SandboxPathError } from "../errors.js";
import type { ExecOptions, ExecResult } from "../types.js";

const execFile = promisify(execFileCb);

export class WorkspaceExecutor {
  constructor(private readonly rootPath: string) {}

  private resolveSafe(rel: string): string {
    const resolved = path.resolve(this.rootPath, rel);
    if (!isPathWithin(this.rootPath, resolved)) {
      throw new SandboxPathError(`Path escapes workspace: ${rel}`);
    }
    return resolved;
  }

  async execShell(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const cwd = options.cwd ? this.resolveSafe(options.cwd) : this.rootPath;
    if (!isPathWithin(this.rootPath, cwd)) {
      throw new SandboxPathError("Invalid cwd");
    }
    try {
      const { stdout, stderr } = await execFile("/bin/sh", ["-c", command], {
        cwd,
        timeout: options.timeoutMs ?? 120_000,
        env: { ...process.env, ...options.env },
        maxBuffer: 16 * 1024 * 1024,
        encoding: "utf8",
      });
      return { stdout: String(stdout), stderr: String(stderr), exitCode: 0 };
    } catch (e) {
      const err = e as {
        code?: number | string;
        stdout?: Buffer;
        stderr?: Buffer;
      };
      const code =
        typeof err.code === "number"
          ? err.code
          : typeof err.code === "string"
            ? Number.parseInt(err.code, 10)
            : 1;
      return {
        stdout: err.stdout?.toString() ?? "",
        stderr: err.stderr?.toString() ?? "",
        exitCode: Number.isFinite(code) ? code : 1,
      };
    }
  }

  async readFile(relPath: string): Promise<string> {
    const p = this.resolveSafe(relPath);
    return fs.readFile(p, "utf8");
  }

  async writeFile(relPath: string, content: string): Promise<void> {
    const p = this.resolveSafe(relPath);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, "utf8");
  }

  async listDir(relPath: string): Promise<string[]> {
    const p = this.resolveSafe(relPath);
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries.map((e) => e.name);
  }
}
