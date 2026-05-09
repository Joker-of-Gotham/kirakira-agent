import type { ValidationResult } from "@kirakira/core";
import { readFileSync } from "node:fs";

import { scanClaude } from "./adapters/claude.js";
import { scanCodex } from "./adapters/codex.js";
import { scanCopilot } from "./adapters/copilot.js";
import { scanCursor } from "./adapters/cursor.js";
import { scanGemini } from "./adapters/gemini.js";
import { detectPlatforms } from "./detector.js";
import { normalizeImport, type UnifiedImportManifest } from "./normalizer.js";
import { scanImportedConfig, type SecurityFinding } from "./security-scanner.js";
import { formatTrustPrompt } from "./trust-prompt.js";
import { validateManifests } from "./validator.js";

export interface ImportPipelineResult {
  readonly detected: ReturnType<typeof detectPlatforms>;
  readonly manifest: UnifiedImportManifest;
  readonly validation: ValidationResult;
  readonly security: SecurityFinding[];
  readonly trustPrompt: string;
}

async function collectScans(workspaceRoot: string): Promise<{
  claude: Awaited<ReturnType<typeof scanClaude>>;
  codex: Awaited<ReturnType<typeof scanCodex>>;
  cursor: Awaited<ReturnType<typeof scanCursor>>;
  copilot: ReturnType<typeof scanCopilot>;
  gemini: ReturnType<typeof scanGemini>;
}> {
  const [claude, codex, cursor] = await Promise.all([
    scanClaude(workspaceRoot),
    scanCodex(workspaceRoot),
    scanCursor(workspaceRoot),
  ]);
  return {
    claude,
    codex,
    cursor,
    copilot: scanCopilot(),
    gemini: scanGemini(workspaceRoot),
  };
}

function collectRawTexts(scans: Awaited<ReturnType<typeof collectScans>>): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  for (const p of scans.claude.mcpConfigPaths) {
    files.push({ path: p, text: readFileSync(p, "utf8") });
  }
  for (const p of scans.cursor.mcpJsonPaths) {
    files.push({ path: p, text: readFileSync(p, "utf8") });
  }
  if (scans.copilot.mcpConfigPath) {
    const p = scans.copilot.mcpConfigPath;
    files.push({ path: p, text: readFileSync(p, "utf8") });
  }
  for (const p of scans.gemini.settingsPaths) {
    files.push({ path: p, text: readFileSync(p, "utf8") });
  }
  if (scans.codex.codexTomlPath) {
    files.push({
      path: scans.codex.codexTomlPath,
      text: readFileSync(scans.codex.codexTomlPath, "utf8"),
    });
  }
  return files;
}

/**
 * Full compat import pipeline: detect → normalize → validate → security scan → trust prompt.
 */
export async function runImportPipeline(
  workspaceRoot: string,
): Promise<ImportPipelineResult> {
  const detected = detectPlatforms(workspaceRoot);
  const scans = await collectScans(workspaceRoot);
  const manifest = normalizeImport({
    claude: scans.claude,
    codex: scans.codex,
    cursor: scans.cursor,
    copilot: scans.copilot,
    gemini: scans.gemini,
  });
  const validation = validateManifests(manifest.skills, manifest.mcp);
  const security = scanImportedConfig(collectRawTexts(scans));
  const trustPrompt = formatTrustPrompt(security);

  return {
    detected,
    manifest,
    validation,
    security,
    trustPrompt,
  };
}
