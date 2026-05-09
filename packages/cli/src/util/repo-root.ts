import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Find the monorepo root (directory containing `pnpm-workspace.yaml`) by walking
 * upward from `startDir` (typically `process.cwd()` or a module path).
 */
export function findRepoRootFrom(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return startDir;
}

/** Repo root from the current working directory. */
export function findRepoRoot(): string {
  return findRepoRootFrom(process.cwd());
}

/** Directory containing this module file (for resolving paths from bundled output). */
export function directoryOfModule(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}
