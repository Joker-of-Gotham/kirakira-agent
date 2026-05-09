import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface CopilotImportScan {
  readonly mcpConfigPath?: string;
}

export function scanCopilot(): CopilotImportScan {
  const p = join(homedir(), ".copilot", "mcp-config.json");
  if (existsSync(p)) {
    return { mcpConfigPath: p };
  }
  return {};
}

export function readCopilotMcpConfig(path: string): string {
  return readFileSync(path, "utf8");
}
