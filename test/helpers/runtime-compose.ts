import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

import { getRepoRoot } from "./repo-root.js";

type ComposeEnvironment = Record<string, string | number | boolean | null> | string[];

export interface ComposeService {
  environment?: ComposeEnvironment;
  ports?: Array<string | { published?: string | number; target?: string | number }>;
}

export interface ComposeFile {
  services: Record<string, ComposeService>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function loadComposeFile(relativePath: string, fromImportMetaUrl: string): ComposeFile {
  const repoRoot = getRepoRoot(fromImportMetaUrl);
  const filePath = path.join(repoRoot, relativePath);
  const document = parseDocument(readFileSync(filePath, "utf8"));
  if (document.errors.length > 0) {
    throw new Error(`Failed to parse ${relativePath}: ${document.errors[0]?.message ?? "unknown YAML error"}`);
  }
  const value = document.toJS() as unknown;
  if (!isRecord(value) || !isRecord(value.services)) {
    throw new Error(`Compose file is missing services: ${relativePath}`);
  }
  return value as unknown as ComposeFile;
}

export function composeService(compose: ComposeFile, name: string): ComposeService {
  const service = compose.services[name];
  if (!service) {
    throw new Error(`Compose service is missing: ${name}`);
  }
  return service;
}

export function environmentValue(service: ComposeService, name: string): string | undefined {
  const environment = service.environment;
  if (!environment) return undefined;
  if (Array.isArray(environment)) {
    const entry = environment.find((item) => item.startsWith(`${name}=`));
    return entry?.slice(name.length + 1);
  }
  const value = environment[name];
  return value === undefined || value === null ? undefined : String(value);
}

function readPortValue(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  const port = Number(value);
  return Number.isInteger(port) ? port : undefined;
}

function parseStringPort(value: string): { published?: number; target?: number } {
  const withoutProtocol = value.split("/")[0] ?? value;
  const parts = withoutProtocol.split(":");
  if (parts.length === 1) {
    const target = readPortValue(parts[0]);
    return { published: target, target };
  }
  return {
    published: readPortValue(parts[parts.length - 2]),
    target: readPortValue(parts[parts.length - 1]),
  };
}

export function publishedPortForTarget(service: ComposeService, targetPort: number): number {
  for (const port of service.ports ?? []) {
    const mapping = typeof port === "string"
      ? parseStringPort(port)
      : {
          published: readPortValue(port.published),
          target: readPortValue(port.target),
        };
    if (mapping.target === targetPort && mapping.published !== undefined) {
      return mapping.published;
    }
  }
  throw new Error(`Compose service does not publish target port ${targetPort}`);
}
