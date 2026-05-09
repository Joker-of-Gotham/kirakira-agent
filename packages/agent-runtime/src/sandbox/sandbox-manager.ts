import { ulid } from "ulid";

import { sandboxProfileSchema, type SandboxProfile } from "@kirakira/core";

import type { KirakiradProfileClient, SandboxSession } from "../types.js";

export class SandboxManager {
  private readonly sessions = new Map<string, SandboxSession>();
  private readonly profiles = new Map<string, SandboxProfile>();
  private readonly kirakirad?: KirakiradProfileClient;

  constructor(options?: {
    kirakirad?: KirakiradProfileClient;
    profiles?: Record<string, SandboxProfile>;
  }) {
    this.kirakirad = options?.kirakirad;
    if (options?.profiles !== undefined) {
      for (const [k, v] of Object.entries(options.profiles)) {
        this.profiles.set(k, v);
      }
    }
  }

  registerProfile(profile: SandboxProfile): void {
    this.profiles.set(profile.name, profile);
  }

  async openSession(profile: string, workspaceId: string): Promise<SandboxSession> {
    let enforced: SandboxProfile | null = null;
    if (this.kirakirad) {
      enforced = await this.kirakirad(profile);
    }
    if (!enforced) {
      enforced = this.getProfile(profile);
    }
    this.registerProfile(enforced);
    const session: SandboxSession = {
      id: ulid(),
      workspaceId,
      profile: enforced.name,
      status: "active",
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.status = "closed";
    s.closedAt = new Date().toISOString();
  }

  getProfile(name: string): SandboxProfile {
    const existing = this.profiles.get(name);
    if (existing) return existing;
    const parsed = sandboxProfileSchema.safeParse({
      name,
      platforms: ["linux"],
      filesystem: {
        root_mode: "workspace",
        read_only_mounts: [],
        read_write_mounts: [],
        deny_paths: [],
      },
      network: { mode: "off" },
      process: {
        seccomp: "default-deny",
        max_cpu_seconds: 300,
        max_memory_mb: 1024,
        allow_exec: ["/bin/sh", "/usr/bin/bash", "/usr/bin/env"],
      },
      secrets: { exposed: [] },
      copyout: { require_post_review: false },
    });
    if (!parsed.success) {
      throw new Error(`Invalid default sandbox profile: ${parsed.error.message}`);
    }
    this.profiles.set(name, parsed.data);
    return parsed.data;
  }
}
