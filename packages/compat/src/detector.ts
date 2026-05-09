import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type CompatPlatform =
  | "claude"
  | "codex"
  | "cursor"
  | "copilot"
  | "gemini";

export interface PlatformDetection {
  readonly platform: CompatPlatform;
  readonly paths: string[];
}

function push(paths: string[], p: string): void {
  if (existsSync(p)) {
    paths.push(p);
  }
}

/** Detect which vendor configuration layouts exist for a workspace. */
export function detectPlatforms(workspaceRoot: string): PlatformDetection[] {
  const root = workspaceRoot;
  const out: PlatformDetection[] = [];

  const claude: string[] = [];
  push(claude, join(root, ".claude", "skills"));
  push(claude, join(root, ".claude", "commands"));
  push(claude, join(root, ".mcp.json"));
  push(claude, join(root, ".claude.json"));
  if (claude.length) {
    out.push({ platform: "claude", paths: claude });
  }

  const codex: string[] = [];
  push(codex, join(root, ".agents", "skills"));
  push(codex, join(root, ".codex", "config.toml"));
  if (codex.length) {
    out.push({ platform: "codex", paths: codex });
  }

  const cursor: string[] = [];
  push(cursor, join(root, ".cursor", "skills"));
  push(cursor, join(root, ".cursor", "commands"));
  push(cursor, join(root, ".cursor", "mcp.json"));
  push(cursor, join(root, ".mcp.json"));
  if (cursor.length) {
    out.push({ platform: "cursor", paths: cursor });
  }

  const copilotPath = join(homedir(), ".copilot", "mcp-config.json");
  if (existsSync(copilotPath)) {
    out.push({ platform: "copilot", paths: [copilotPath] });
  }

  const gemini: string[] = [];
  push(gemini, join(root, ".gemini", "settings.json"));
  push(gemini, join(root, ".antigravity", "settings.json"));
  push(gemini, join(homedir(), ".gemini", "settings.json"));
  if (gemini.length) {
    out.push({ platform: "gemini", paths: gemini });
  }

  return out;
}
