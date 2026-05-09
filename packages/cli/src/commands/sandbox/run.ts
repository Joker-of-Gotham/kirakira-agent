import { Args, Command, Flags } from "@oclif/core";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";

import type { SandboxProfile } from "@kirakira/core";
import { ProfileRegistry } from "@kirakira/policy-engine";

export interface SandboxRunOptions {
  profile: string;
  command: string[];
  timeout?: number;
}

type SandboxRuntime = "nsjail" | "bwrap" | "unshare" | "sandbox-exec" | "direct";

function detectRuntime(): SandboxRuntime {
  const os = platform();
  if (os === "darwin") {
    return "sandbox-exec";
  }
  if (os !== "linux") {
    return "direct";
  }
  // Check for nsjail first (strongest isolation)
  try {
    execFileSync("nsjail", ["--help"], { stdio: "ignore" });
    return "nsjail";
  } catch {
    /* binary absent, try next */
  }
  try {
    execFileSync("bwrap", ["--version"], { stdio: "ignore" });
    return "bwrap";
  } catch {
    /* binary absent, try next */
  }
  try {
    execFileSync("unshare", ["--help"], { stdio: "ignore", timeout: 2000 });
    return "unshare";
  } catch {
    /* binary absent, fall through to direct */
  }
  return "direct";
}

function buildNsjailArgs(profile: SandboxProfile, cmd: string[]): string[] {
  const args: string[] = [
    "--mode",
    "o",
    "--time_limit",
    String(profile.process.max_cpu_seconds),
    "--rlimit_as",
    String(profile.process.max_memory_mb),
  ];

  if (profile.network.mode === "off") {
    args.push("--disable_clone_newnet", "false");
  }

  for (const mount of profile.filesystem.read_only_mounts) {
    args.push("-R", mount);
  }
  for (const mount of profile.filesystem.read_write_mounts) {
    args.push("-B", mount);
  }

  args.push("--", ...cmd);
  return args;
}

function buildBwrapArgs(profile: SandboxProfile, cmd: string[]): string[] {
  const args: string[] = ["--die-with-parent", "--new-session"];

  if (profile.network.mode === "off") {
    args.push("--unshare-net");
  }

  // Filesystem mounts
  if (
    profile.filesystem.root_mode === "none" ||
    profile.filesystem.root_mode === "temp"
  ) {
    args.push("--tmpfs", "/");
  }

  for (const mount of profile.filesystem.read_only_mounts) {
    if (existsSync(mount)) {
      args.push("--ro-bind", mount, mount);
    }
  }
  for (const mount of profile.filesystem.read_write_mounts) {
    if (existsSync(mount)) {
      args.push("--bind", mount, mount);
    }
  }

  // Essential system mounts
  args.push("--proc", "/proc");
  args.push("--dev", "/dev");
  if (existsSync("/usr")) args.push("--ro-bind", "/usr", "/usr");
  if (existsSync("/lib")) args.push("--ro-bind", "/lib", "/lib");
  if (existsSync("/lib64")) args.push("--ro-bind", "/lib64", "/lib64");
  if (existsSync("/bin")) args.push("--ro-bind", "/bin", "/bin");
  if (existsSync("/sbin")) args.push("--ro-bind", "/sbin", "/sbin");
  if (existsSync("/etc/resolv.conf") && profile.network.mode !== "off") {
    args.push("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf");
  }
  if (existsSync("/etc/ssl")) {
    args.push("--ro-bind", "/etc/ssl", "/etc/ssl");
  }

  args.push("--", ...cmd);
  return args;
}

function buildUnshareArgs(profile: SandboxProfile, cmd: string[]): string[] {
  const args: string[] = ["--map-root-user", "--fork"];

  if (profile.network.mode === "off") {
    args.push("--net");
  }

  args.push("--mount");
  args.push("--", ...cmd);
  return args;
}

function buildMacOsSandboxProfile(profile: SandboxProfile): string {
  const rules: string[] = ["(version 1)", "(deny default)"];

  // Allow basic operations
  rules.push("(allow process-exec)");
  rules.push("(allow process-fork)");
  rules.push("(allow sysctl-read)");
  rules.push("(allow mach-lookup)");
  rules.push("(allow signal)");

  // File access
  for (const mount of profile.filesystem.read_only_mounts) {
    rules.push(`(allow file-read* (subpath "${mount}"))`);
  }
  for (const mount of profile.filesystem.read_write_mounts) {
    rules.push(`(allow file-read* (subpath "${mount}"))`);
    rules.push(`(allow file-write* (subpath "${mount}"))`);
  }

  // System libraries
  rules.push('(allow file-read* (subpath "/usr"))');
  rules.push('(allow file-read* (subpath "/System"))');
  rules.push('(allow file-read* (subpath "/Library"))');
  rules.push('(allow file-read* (subpath "/private/var"))');
  rules.push('(allow file-read* (subpath "/dev"))');

  // Network
  if (profile.network.mode !== "off") {
    rules.push("(allow network*)");
  }

  return rules.join("\n");
}

export async function sandboxRun(options: SandboxRunOptions): Promise<void> {
  const registry = new ProfileRegistry();
  registry.registerBuiltinProfiles();

  const profile = registry.get(options.profile);
  if (!profile) {
    console.error(`Unknown sandbox profile: ${options.profile}`);
    console.error(`Available: ${registry.list().map((p) => p.name).join(", ")}`);
    process.exit(1);
  }

  const cmd0 = options.command[0];
  if (!cmd0) {
    console.error("Command is empty");
    process.exit(1);
  }

  const runtime = detectRuntime();
  const timeoutMs =
    ((options.timeout ?? profile.process.max_cpu_seconds) ?? 300) * 1000;

  console.log(`Sandbox Profile: ${profile.name}`);
  console.log(`  Runtime: ${runtime}`);
  console.log(`  Filesystem: root_mode=${profile.filesystem.root_mode}`);
  console.log(`  Network: mode=${profile.network.mode}`);
  console.log(`  Seccomp: ${profile.process.seccomp}`);
  console.log(`  CPU limit: ${profile.process.max_cpu_seconds}s`);
  console.log(`  Memory limit: ${profile.process.max_memory_mb}MB`);
  console.log(`  Command: ${options.command.join(" ")}`);
  console.log();

  const env: Record<string, string> = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: process.env.HOME || "/tmp",
    KIRAKIRA_SANDBOX_PROFILE: profile.name,
    KIRAKIRA_SANDBOX_NETWORK_MODE: profile.network.mode,
    KIRAKIRA_SANDBOX_RUNTIME: runtime,
  };

  // Propagate allowed env vars
  for (const secret of profile.secrets.exposed) {
    if (process.env[secret]) {
      env[secret] = process.env[secret]!;
    }
  }

  try {
    switch (runtime) {
      case "nsjail": {
        const nsjailArgs = buildNsjailArgs(profile, options.command);
        const result = spawnSync("nsjail", nsjailArgs, {
          stdio: "inherit",
          timeout: timeoutMs,
          env,
        });
        if (result.status !== null && result.status !== 0) {
          process.exit(result.status);
        }
        break;
      }
      case "bwrap": {
        const bwrapArgs = buildBwrapArgs(profile, options.command);
        const result = spawnSync("bwrap", bwrapArgs, {
          stdio: "inherit",
          timeout: timeoutMs,
          env,
        });
        if (result.status !== null && result.status !== 0) {
          process.exit(result.status);
        }
        break;
      }
      case "unshare": {
        const unshareArgs = buildUnshareArgs(profile, options.command);
        const result = spawnSync("unshare", unshareArgs, {
          stdio: "inherit",
          timeout: timeoutMs,
          env,
        });
        if (result.status !== null && result.status !== 0) {
          process.exit(result.status);
        }
        break;
      }
      case "sandbox-exec": {
        const sbProfile = buildMacOsSandboxProfile(profile);
        const result = spawnSync(
          "sandbox-exec",
          ["-p", sbProfile, ...options.command],
          {
            stdio: "inherit",
            timeout: timeoutMs,
            env,
          },
        );
        if (result.status !== null && result.status !== 0) {
          process.exit(result.status);
        }
        break;
      }
      case "direct": {
        console.warn("WARNING: No sandbox runtime available. Running without isolation.");
        console.warn("Install nsjail or bubblewrap for real sandboxing on Linux.");
        execFileSync(cmd0, options.command.slice(1), {
          timeout: timeoutMs,
          stdio: "inherit",
          env,
        });
        break;
      }
    }
  } catch (err: unknown) {
    const ex = err as { status?: number };
    if (ex.status !== undefined) {
      process.exit(ex.status ?? 1);
    }
    throw err;
  }
}

export default class SandboxRunCmd extends Command {
  static override description =
    "Execute a command within a sandboxed environment using nsjail, bubblewrap, unshare, or sandbox-exec";

  static override args = {
    command: Args.string({
      description: "Command and arguments to execute",
      required: true,
    }),
  };

  static override strict = false;

  static override flags = {
    profile: Flags.string({
      description: "Sandbox profile name",
      default: "read-only",
    }),
    timeout: Flags.integer({
      description: "Override CPU-ish timeout seconds (defaults to profile max_cpu_seconds)",
    }),
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(SandboxRunCmd);
    const command = argv as string[];
    if (!command?.length) {
      this.error("Provide a command to run, e.g. kirakira-agent sandbox run ls");
    }

    await sandboxRun({
      profile: flags.profile ?? "read-only",
      command,
      ...(flags.timeout !== undefined ? { timeout: flags.timeout } : {}),
    });
  }
}
