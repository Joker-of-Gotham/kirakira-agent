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

export function environmentValue(
  service: ComposeService,
  name: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const environment = service.environment;
  if (!environment) return undefined;
  if (Array.isArray(environment)) {
    const entry = environment.find((item) => item.startsWith(`${name}=`));
    return entry ? resolveComposeValue(entry.slice(name.length + 1), env) : undefined;
  }
  const value = environment[name];
  return value === undefined || value === null ? undefined : resolveComposeValue(String(value), env);
}

function matchingBrace(value: string, openBraceIndex: number): number {
  let depth = 1;
  for (let index = openBraceIndex + 1; index < value.length; index += 1) {
    if (value[index] === "$" && value[index + 1] === "{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (value[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function evaluateComposeExpression(expression: string, env: Record<string, string | undefined>): string {
  const match = /^([_a-zA-Z][_a-zA-Z0-9]*)(?:(:?[-?+])([\s\S]*))?$/u.exec(expression);
  if (!match) return "";
  const [, name, operator, operand = ""] = match;
  const value = env[name];
  if (!operator) return value ?? "";
  if (operator === ":-") {
    return value === undefined || value === "" ? resolveComposeValue(operand, env) : value;
  }
  if (operator === "-") {
    return value === undefined ? resolveComposeValue(operand, env) : value;
  }
  return value ?? "";
}

export function resolveComposeValue(
  value: string,
  env: Record<string, string | undefined> = process.env,
): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "$") {
      output += char;
      continue;
    }
    if (value[index + 1] === "$") {
      output += "$";
      index += 1;
      continue;
    }
    if (value[index + 1] === "{") {
      const closeIndex = matchingBrace(value, index + 1);
      if (closeIndex === -1) {
        output += char;
        continue;
      }
      output += evaluateComposeExpression(value.slice(index + 2, closeIndex), env);
      index = closeIndex;
      continue;
    }
    output += char;
  }
  return output;
}

function readPortValue(
  value: string | number | undefined,
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  const port = Number(resolveComposeValue(value, env));
  return Number.isInteger(port) ? port : undefined;
}

function parseStringPort(
  value: string,
  env: Record<string, string | undefined> = process.env,
): { published?: number; target?: number } {
  const withoutProtocol = resolveComposeValue(value, env).split("/")[0] ?? value;
  const parts = withoutProtocol.split(":");
  if (parts.length === 1) {
    const target = readPortValue(parts[0], env);
    return { published: target, target };
  }
  return {
    published: readPortValue(parts[parts.length - 2], env),
    target: readPortValue(parts[parts.length - 1], env),
  };
}

export function publishedPortForTarget(
  service: ComposeService,
  targetPort: number,
  env: Record<string, string | undefined> = process.env,
): number {
  for (const port of service.ports ?? []) {
    const mapping = typeof port === "string"
      ? parseStringPort(port, env)
      : {
          published: readPortValue(port.published, env),
          target: readPortValue(port.target, env),
        };
    if (mapping.target === targetPort && mapping.published !== undefined) {
      return mapping.published;
    }
  }
  throw new Error(`Compose service does not publish target port ${targetPort}`);
}
