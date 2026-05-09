import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { McpServerEntry } from "@kirakira/core";

export interface GeminiImportScan {
  readonly settingsPaths: string[];
}

/** Candidate Gemini / Antigravity `settings.json` locations. */
export function scanGemini(workspaceRoot: string): GeminiImportScan {
  const paths: string[] = [];
  const root = workspaceRoot;
  for (const rel of [join(".gemini", "settings.json"), join(".antigravity", "settings.json")]) {
    const p = join(root, rel);
    if (existsSync(p)) {
      paths.push(p);
    }
  }
  const homeSettings = join(homedir(), ".gemini", "settings.json");
  if (existsSync(homeSettings)) {
    paths.push(homeSettings);
  }
  return { settingsPaths: paths };
}

/** Extract `mcpServers` object from Gemini-style settings.json */
export function parseGeminiMcpServers(jsonText: string): Record<string, McpServerEntry> {
  const data = JSON.parse(jsonText) as { mcpServers?: Record<string, unknown> };
  const raw = data.mcpServers ?? {};
  const out: Record<string, McpServerEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === "object") {
      out[k] = v as McpServerEntry;
    }
  }
  return out;
}

export function readSettingsJson(path: string): string {
  return readFileSync(path, "utf8");
}
