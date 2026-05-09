import fg from "fast-glob";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CursorImportScan {
  readonly skillPaths: string[];
  readonly commandPaths: string[];
  readonly mcpJsonPaths: string[];
}

export async function scanCursor(workspaceRoot: string): Promise<CursorImportScan> {
  const root = workspaceRoot.replace(/\\/g, "/");
  const skillPaths = await fg(".cursor/skills/**/SKILL.md", {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });
  const commandPaths = await fg(".cursor/commands/**/*.{md,mdx}", {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });

  const mcpJsonPaths: string[] = [];
  const cursorMcp = join(root, ".cursor", "mcp.json");
  if (existsSync(cursorMcp)) {
    mcpJsonPaths.push(cursorMcp);
  }
  const dotMcp = join(root, ".mcp.json");
  if (existsSync(dotMcp)) {
    mcpJsonPaths.push(dotMcp);
  }

  return { skillPaths, commandPaths, mcpJsonPaths };
}

export function readJsonFile(path: string): string {
  return readFileSync(path, "utf8");
}
