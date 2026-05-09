import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve monorepo root (directory containing `pnpm-workspace.yaml`) from any test file. */
export function getRepoRoot(fromImportMetaUrl: string): string {
  let dir = path.dirname(fileURLToPath(fromImportMetaUrl));
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`pnpm-workspace.yaml not found searching upward from ${dir}`);
    }
    dir = parent;
  }
}
