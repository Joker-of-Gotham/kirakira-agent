import type { PluginKind } from "@kirakira/core";
import type { PluginSandboxPolicy } from "./types.js";
import { defaultSandboxPolicy } from "./types.js";

export class PluginSandboxViolation extends Error {
  constructor(
    message: string,
    readonly capability: keyof PluginSandboxPolicy,
  ) {
    super(message);
    this.name = "PluginSandboxViolation";
  }
}

export function policyForPlugin(kind: PluginKind): PluginSandboxPolicy {
  return defaultSandboxPolicy(kind);
}

export function assertFsReadAllowed(policy: PluginSandboxPolicy): void {
  if (!policy.allowFsRead) {
    throw new PluginSandboxViolation("filesystem read blocked", "allowFsRead");
  }
}

export function assertFsWriteAllowed(policy: PluginSandboxPolicy): void {
  if (!policy.allowFsWrite) {
    throw new PluginSandboxViolation("filesystem write blocked", "allowFsWrite");
  }
}

export function assertNetworkAllowed(policy: PluginSandboxPolicy): void {
  if (!policy.allowNetwork) {
    throw new PluginSandboxViolation("network blocked", "allowNetwork");
  }
}

export function assertChildProcessAllowed(policy: PluginSandboxPolicy): void {
  if (!policy.allowChildProcesses) {
    throw new PluginSandboxViolation("child processes blocked", "allowChildProcesses");
  }
}
