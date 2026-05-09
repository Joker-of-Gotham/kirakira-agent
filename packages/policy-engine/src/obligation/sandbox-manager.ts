import type { PolicyDecision } from "@kirakira/core";

import type { ProfileRegistry } from "./profile-registry.js";

export interface SandboxState {
  currentProfile: string;
  activeSince: string;
}

export class SandboxManager {
  private currentProfile = "plan-only";

  private activeSince = new Date().toISOString();

  private readonly profileRegistry: ProfileRegistry;

  constructor(profileRegistry: ProfileRegistry) {
    this.profileRegistry = profileRegistry;
    if (this.profileRegistry.list().length === 0) this.profileRegistry.registerBuiltinProfiles();
    const plan = this.profileRegistry.get("plan-only");
    this.currentProfile =
      plan?.name ?? this.profileRegistry.list()[0]?.name ?? this.currentProfile;
  }

  getCurrentProfile(): string {
    return this.currentProfile;
  }

  /** Apply a PDP-selected sandbox profile. Hosts may consult {@link ProfileRegistry.validate} beforehand. */
  async switchProfile(profileName: string, _decision: PolicyDecision): Promise<void> {
    const p = this.profileRegistry.get(profileName);
    if (!p) throw new Error(`Unknown sandbox profile "${profileName}"`);
    void _decision;
    this.currentProfile = profileName;
    this.activeSince = new Date().toISOString();
  }

  getState(): SandboxState {
    return { currentProfile: this.currentProfile, activeSince: this.activeSince };
  }
}
