import { Buffer } from "node:buffer";
import { createHash } from "blake3";

import { canonicalJson } from "./canonical-json.js";
import { isEphemeral } from "./ephemeral-fields.js";

export interface FingerprintResult {
  exact: string;
  template: string;
}

export interface FingerprintInput {
  tool_type: string;
  action_family?: string;
  command_base?: string;
  read_paths?: string[];
  write_paths?: string[];
  network_domains?: string[];
  destructive?: boolean;
  package_install?: boolean;
  vcs_push?: boolean;
  secret_touch?: boolean;
  sandbox_profile?: string;
  principal_roles?: string[];
  workspace_trust?: string;
}

function blake3Hex(json: string): string {
  return createHash().update(Buffer.from(json, "utf8")).digest("hex");
}

function sortedCopy(arr: readonly string[]): string[] {
  return [...arr].sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
}

function featureRecord(input: FingerprintInput): Record<string, unknown> {
  const r: Record<string, unknown> = { tool_type: input.tool_type };
  if (input.action_family !== undefined) r.action_family = input.action_family;
  if (input.command_base !== undefined) r.command_base = input.command_base;
  if (input.read_paths !== undefined) r.read_paths = sortedCopy(input.read_paths);
  if (input.write_paths !== undefined) r.write_paths = sortedCopy(input.write_paths);
  if (input.network_domains !== undefined)
    r.network_domains = sortedCopy(input.network_domains);
  if (input.destructive !== undefined) r.destructive = input.destructive;
  if (input.package_install !== undefined) r.package_install = input.package_install;
  if (input.vcs_push !== undefined) r.vcs_push = input.vcs_push;
  if (input.secret_touch !== undefined) r.secret_touch = input.secret_touch;
  if (input.sandbox_profile !== undefined) r.sandbox_profile = input.sandbox_profile;
  if (input.principal_roles !== undefined)
    r.principal_roles = sortedCopy(input.principal_roles);
  if (input.workspace_trust !== undefined) r.workspace_trust = input.workspace_trust;
  return r;
}

function deepStripEphemeral(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((x) => deepStripEphemeral(x));
  const o = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    if (isEphemeral(k)) continue;
    out[k] = deepStripEphemeral(o[k]);
  }
  return out;
}

export function stripEphemeralFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return deepStripEphemeral(obj) as Partial<T>;
}

export function computeFingerprint(input: FingerprintInput): FingerprintResult {
  const features = featureRecord(input);
  const exact = blake3Hex(canonicalJson(features));
  const stripped = deepStripEphemeral(features) as Record<string, unknown>;
  const template = blake3Hex(canonicalJson(stripped));
  return { exact, template };
}
