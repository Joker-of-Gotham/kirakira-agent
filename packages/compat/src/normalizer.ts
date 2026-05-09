import matter from "gray-matter";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import {
  SCHEMA_VERSIONS,
  mcpConfigFileSchema,
  type McpManifest,
  type McpServerEntry,
  type SkillManifest,
  type SkillSourceType,
} from "@kirakira/core";

import type { ClaudeImportScan } from "./adapters/claude.js";
import { readMcpConfigFile } from "./adapters/claude.js";
import type { CodexImportScan } from "./adapters/codex.js";
import {
  parseCodexMcpServers,
  readCodexToml,
} from "./adapters/codex.js";
import type { CopilotImportScan } from "./adapters/copilot.js";
import { readCopilotMcpConfig } from "./adapters/copilot.js";
import type { CursorImportScan } from "./adapters/cursor.js";
import type { GeminiImportScan } from "./adapters/gemini.js";
import {
  parseGeminiMcpServers,
  readSettingsJson,
} from "./adapters/gemini.js";

export interface UnifiedImportManifest {
  readonly skills: SkillManifest[];
  readonly mcp: McpManifest[];
}

function sourceFor(platform: SkillSourceType): SkillSourceType {
  return platform;
}

function readSkillName(path: string): string {
  const raw = readFileSync(path, "utf8");
  const fm = matter(raw);
  const name = fm.data["name"];
  return typeof name === "string" && name.trim() ? name.trim() : basename(path, ".md");
}

function skillToManifest(
  path: string,
  importedFrom: SkillSourceType,
): SkillManifest {
  const name = readSkillName(path);
  return {
    kind: "skill",
    schemaVersion: SCHEMA_VERSIONS.skillManifest,
    name,
    displayName: name,
    source: { type: sourceFor(importedFrom), path },
    trust: { level: "untrusted", publisher: `compat-${importedFrom}` },
    activation: { mode: "auto-or-explicit", aliases: [] },
    files: {
      entry: path,
      scripts: [],
      references: [],
    },
    compat: { format: "markdown-skill", importedFrom },
  };
}

function commandToAliasManifest(
  path: string,
  importedFrom: SkillSourceType,
): SkillManifest {
  const stem = basename(path, ".md");
  return {
    kind: "skill",
    schemaVersion: SCHEMA_VERSIONS.skillManifest,
    name: stem,
    displayName: stem,
    source: { type: sourceFor(importedFrom), path },
    trust: { level: "untrusted", publisher: `compat-command-${importedFrom}` },
    activation: {
      mode: "explicit-only",
      aliases: [stem, stem.replace(/-/g, "_")],
    },
    files: { entry: path, scripts: [], references: [] },
    compat: { format: "markdown-command", importedFrom },
  };
}

function normalizeMcpServerConfig(
  name: string,
  entry: McpServerEntry,
): McpManifest {
  if (entry.command) {
    return {
      kind: "mcp",
      schemaVersion: SCHEMA_VERSIONS.mcpManifest,
      name,
      source: { type: "import", file: undefined },
      transport: {
        kind: "stdio",
        command: entry.command,
        args: entry.args ?? [],
        ...(entry.env !== undefined ? { env: entry.env } : {}),
      },
      auth: { mode: "none" },
      tools: entry.tools?.length ? { enabled: [...entry.tools] } : undefined,
      timeouts:
        entry.timeout !== undefined
          ? { startupSec: entry.timeout, toolSec: entry.timeout }
          : undefined,
      trust: { level: "untrusted" },
      compat: {},
    };
  }

  if (entry.url) {
    return {
      kind: "mcp",
      schemaVersion: SCHEMA_VERSIONS.mcpManifest,
      name,
      source: { type: "import", file: undefined },
      transport: {
        kind: "http",
        url: entry.url,
        ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
      },
      auth: { mode: "none" },
      tools: entry.tools?.length ? { enabled: [...entry.tools] } : undefined,
      timeouts:
        entry.timeout !== undefined
          ? { startupSec: entry.timeout, toolSec: entry.timeout }
          : undefined,
      trust: { level: "untrusted" },
      compat: {},
    };
  }

  throw new Error(`MCP server "${name}" is missing command or url`);
}

function mcpFileToManifests(
  filePath: string,
  jsonText: string,
): McpManifest[] {
  const raw: unknown = JSON.parse(jsonText);
  const parsed = mcpConfigFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid MCP JSON at ${filePath}`);
  }
  return Object.entries(parsed.data.mcpServers).map(([name, entry]) => ({
    ...normalizeMcpServerConfig(name, entry),
    source: { type: "import", file: filePath },
  }));
}

export interface NormalizerInput {
  readonly claude?: ClaudeImportScan;
  readonly codex?: CodexImportScan;
  readonly cursor?: CursorImportScan;
  readonly copilot?: CopilotImportScan;
  readonly gemini?: GeminiImportScan;
}

/** Normalize scanned vendor layouts into unified Kirakira manifests. */
export function normalizeImport(input: NormalizerInput): UnifiedImportManifest {
  const skills: SkillManifest[] = [];
  const mcp: McpManifest[] = [];

  if (input.claude) {
    for (const p of input.claude.skillPaths) {
      skills.push(skillToManifest(p, "imported-claude"));
    }
    for (const p of input.claude.commandPaths) {
      skills.push(commandToAliasManifest(p, "imported-claude"));
    }
    for (const cfgPath of input.claude.mcpConfigPaths) {
      mcp.push(...mcpFileToManifests(cfgPath, readMcpConfigFile(cfgPath)));
    }
  }

  if (input.codex) {
    for (const p of input.codex.skillPaths) {
      skills.push(skillToManifest(p, "imported-codex"));
    }
    if (input.codex.codexTomlPath) {
      const toml = readCodexToml(input.codex.codexTomlPath);
      const servers = parseCodexMcpServers(toml);
      for (const [name, entry] of Object.entries(servers)) {
        mcp.push({
          ...normalizeMcpServerConfig(name, entry),
          source: { type: "import", file: input.codex.codexTomlPath },
        });
      }
    }
  }

  if (input.cursor) {
    for (const p of input.cursor.skillPaths) {
      skills.push(skillToManifest(p, "imported-cursor"));
    }
    for (const p of input.cursor.commandPaths) {
      skills.push(commandToAliasManifest(p, "imported-cursor"));
    }
    for (const cfg of input.cursor.mcpJsonPaths) {
      mcp.push(...mcpFileToManifests(cfg, readFileSync(cfg, "utf8")));
    }
  }

  if (input.copilot?.mcpConfigPath) {
    const p = input.copilot.mcpConfigPath;
    mcp.push(...mcpFileToManifests(p, readCopilotMcpConfig(p)));
  }

  if (input.gemini) {
    for (const settingsPath of input.gemini.settingsPaths) {
      const text = readSettingsJson(settingsPath);
      const servers = parseGeminiMcpServers(text);
      for (const [name, entry] of Object.entries(servers)) {
        mcp.push({
          ...normalizeMcpServerConfig(name, entry),
          source: { type: "import", file: settingsPath },
        });
      }
    }
  }

  return { skills, mcp };
}
