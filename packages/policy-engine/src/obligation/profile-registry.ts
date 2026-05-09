import type { SandboxProfile } from "@kirakira/core";

const V = "kirakira.sandbox.v1" as const;

const LINUX_MACOS_WINDOWS = ["linux", "macos", "windows"] as const;

/** Host sandbox runtimes should remap this to the real workspace mount. */
const WORKSPACE_ROOT_MOUNT = "/workspace";

function builtinPlanOnly(): SandboxProfile {
  return {
    version: V,
    name: "plan-only",
    platforms: [...LINUX_MACOS_WINDOWS],
    filesystem: {
      root_mode: "none",
      read_only_mounts: [],
      read_write_mounts: [],
      deny_paths: ["**"],
    },
    network: { mode: "off" },
    process: {
      seccomp: "default-deny",
      max_cpu_seconds: 10,
      max_memory_mb: 256,
      allow_exec: [],
    },
    secrets: { exposed: [] },
    copyout: { require_post_review: false },
  };
}

function builtinReadOnly(): SandboxProfile {
  return {
    version: V,
    name: "read-only",
    platforms: [...LINUX_MACOS_WINDOWS],
    filesystem: {
      root_mode: "workspace",
      read_only_mounts: [WORKSPACE_ROOT_MOUNT, "/usr", "/etc/ssl/certs"],
      read_write_mounts: ["/tmp"],
      deny_paths: ["~/.ssh/**", "~/.aws/**"],
    },
    network: { mode: "off" },
    process: {
      seccomp: "default-deny",
      max_cpu_seconds: 60,
      max_memory_mb: 512,
      allow_exec: ["cat", "grep", "find", "ls", "head", "tail", "wc", "sort", "uniq", "git"],
    },
    secrets: { exposed: [] },
    copyout: { require_post_review: false },
  };
}

function builtinWorkspaceWrite(): SandboxProfile {
  return {
    version: V,
    name: "workspace-write",
    platforms: [...LINUX_MACOS_WINDOWS],
    filesystem: {
      root_mode: "workspace",
      read_only_mounts: [],
      read_write_mounts: [WORKSPACE_ROOT_MOUNT, "/tmp"],
      deny_paths: ["~/.ssh/**", "~/.aws/**"],
    },
    network: { mode: "off" },
    process: {
      seccomp: "permissive",
      max_cpu_seconds: 300,
      max_memory_mb: 2048,
      allow_exec: ["*"],
    },
    secrets: { exposed: [] },
    copyout: { require_post_review: false },
  };
}

function builtinWorkspaceWriteNet(): SandboxProfile {
  return {
    version: V,
    name: "workspace-write-net",
    platforms: [...LINUX_MACOS_WINDOWS],
    filesystem: {
      root_mode: "workspace",
      read_only_mounts: [],
      read_write_mounts: [WORKSPACE_ROOT_MOUNT, "/tmp"],
      deny_paths: ["~/.ssh/**", "~/.aws/**"],
    },
    network: {
      mode: "allowlist",
      domains: ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org", "github.com"],
    },
    process: {
      seccomp: "permissive",
      max_cpu_seconds: 600,
      max_memory_mb: 4096,
      allow_exec: ["*"],
    },
    secrets: { exposed: ["NPM_TOKEN"] },
    egress_proxy: "https://egress.internal:8080",
    copyout: { require_post_review: false },
  };
}

function builtinMcpRead(): SandboxProfile {
  return {
    version: V,
    name: "mcp-read",
    platforms: [...LINUX_MACOS_WINDOWS],
    filesystem: {
      root_mode: "none",
      read_only_mounts: [],
      read_write_mounts: [],
      deny_paths: ["**"],
    },
    network: {
      mode: "per-server",
      domains: ["127.0.0.1", "localhost"],
    },
    process: {
      seccomp: "default-deny",
      max_cpu_seconds: 30,
      max_memory_mb: 512,
      allow_exec: [],
    },
    secrets: { exposed: [] },
    copyout: { require_post_review: false },
  };
}

function builtinMcpWrite(): SandboxProfile {
  return {
    version: V,
    name: "mcp-write",
    platforms: [...LINUX_MACOS_WINDOWS],
    filesystem: {
      root_mode: "workspace",
      read_only_mounts: [],
      read_write_mounts: [WORKSPACE_ROOT_MOUNT],
      deny_paths: ["~/.ssh/**", "~/.aws/**", "~/.gnupg/**"],
    },
    network: {
      mode: "per-server",
      domains: ["127.0.0.1", "localhost"],
    },
    process: {
      seccomp: "default-deny",
      max_cpu_seconds: 60,
      max_memory_mb: 1024,
      allow_exec: [],
    },
    secrets: { exposed: [] },
    copyout: { require_post_review: true },
  };
}

function builtinMicroVmHighrisk(): SandboxProfile {
  return {
    version: V,
    name: "microvm-highrisk",
    platforms: [...LINUX_MACOS_WINDOWS],
    filesystem: {
      root_mode: "temp",
      read_only_mounts: [],
      read_write_mounts: ["/tmp/kirakira-sandbox"],
      deny_paths: ["**"],
    },
    network: { mode: "off" },
    process: {
      seccomp: "default-deny",
      max_cpu_seconds: 120,
      max_memory_mb: 2048,
      allow_exec: [],
    },
    secrets: { exposed: [] },
    copyout: { require_post_review: true },
  };
}

export class ProfileRegistry {
  private readonly profiles = new Map<string, SandboxProfile>();

  constructor() {}

  registerBuiltinProfiles(): void {
    for (const p of [
      builtinPlanOnly(),
      builtinReadOnly(),
      builtinWorkspaceWrite(),
      builtinWorkspaceWriteNet(),
      builtinMcpRead(),
      builtinMcpWrite(),
      builtinMicroVmHighrisk(),
    ])
      this.profiles.set(p.name, p);
  }

  register(profile: SandboxProfile): void {
    this.profiles.set(profile.name, profile);
  }

  get(name: string): SandboxProfile | undefined {
    return this.profiles.get(name);
  }

  list(): SandboxProfile[] {
    return [...this.profiles.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  validate(profile: SandboxProfile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (profile.platforms.length === 0)
      errors.push("platforms must not be empty");
    if (profile.process.max_cpu_seconds <= 0)
      errors.push("process.max_cpu_seconds must be positive");
    if (profile.process.max_memory_mb <= 0)
      errors.push("process.max_memory_mb must be positive");

    switch (profile.filesystem.root_mode) {
      case "none":
      case "workspace":
      case "temp":
        break;
      default:
        errors.push(`invalid filesystem.root_mode: ${profile.filesystem.root_mode as string}`);
    }

    switch (profile.network.mode) {
      case "off":
      case "allowlist":
      case "per-server":
      case "full":
        break;
      default:
        errors.push(`invalid network.mode: ${profile.network.mode as string}`);
    }

    if (profile.network.mode === "allowlist" || profile.network.mode === "per-server") {
      if (!profile.network.domains || profile.network.domains.length === 0)
        errors.push(`network.mode ${profile.network.mode} requires domains list`);
    }

    switch (profile.process.seccomp) {
      case "default-deny":
      case "permissive":
        break;
      default:
        errors.push(`invalid process.seccomp: ${profile.process.seccomp as string}`);
    }

    return { valid: errors.length === 0, errors };
  }
}
