import fg from "fast-glob";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";

import type { SkillMeta } from "@kirakira/core";
import { readLockFile, getWorkspaceLockPath } from "@kirakira/core";

import { buildSkillIndex } from "./index-builder.js";

export interface DiscoveryEntry {
  readonly path: string;
  readonly tier: number;
}

/**
 * Collect SKILL.md paths in priority order (lower tier wins on dedupe).
 *
 * Tier 1: workspace .kirakira/skills tree  
 * Tier 2: skill packages referenced by ``kirakira.lock`` with ``file:`` on-disk sources  
 * Tier 3: compat dirs under workspace  
 * Tier 4: user home .kirakira/skills tree  
 * Tier 5: system /etc/kirakira/skills tree
 */
export async function discoverSkillEntries(
  workspaceRoot: string,
): Promise<DiscoveryEntry[]> {
  const root = workspaceRoot.replace(/\\/g, "/");
  const home = homedir().replace(/\\/g, "/");
  const userEam = join(home, ".kirakira").replace(/\\/g, "/");

  const globs: { pattern: string; tier: number; cwd: string }[] = [
    { pattern: ".kirakira/skills/**/SKILL.md", tier: 1, cwd: root },
    { pattern: ".claude/skills/**/SKILL.md", tier: 3, cwd: root },
    { pattern: ".agents/skills/**/SKILL.md", tier: 3, cwd: root },
    { pattern: ".cursor/skills/**/SKILL.md", tier: 3, cwd: root },
    { pattern: ".cursor/commands/**/*.{md,mdx}", tier: 3, cwd: root },
  ];

  if (existsSync(userEam)) {
    globs.push({
      pattern: "skills/**/SKILL.md",
      tier: 4,
      cwd: userEam,
    });
  }

  const userClaudeSkills = join(home, ".claude", "skills").replace(/\\/g, "/");
  if (existsSync(userClaudeSkills)) {
    globs.push({
      pattern: "**/SKILL.md",
      tier: 4,
      cwd: userClaudeSkills,
    });
  }

  const userAgentsSkills = join(home, ".agents", "skills").replace(/\\/g, "/");
  if (existsSync(userAgentsSkills)) {
    globs.push({
      pattern: "**/SKILL.md",
      tier: 4,
      cwd: userAgentsSkills,
    });
  }

  const userCursorSkills = join(home, ".cursor", "skills").replace(/\\/g, "/");
  if (existsSync(userCursorSkills)) {
    globs.push({
      pattern: "**/SKILL.md",
      tier: 4,
      cwd: userCursorSkills,
    });
  }

  if (existsSync("/etc/kirakira/skills")) {
    globs.push({ pattern: "**/SKILL.md", tier: 5, cwd: "/etc/kirakira/skills" });
  }

  const byPath = new Map<string, number>();

  for (const { pattern, tier, cwd } of globs) {
    const paths = await fg(pattern, {
      cwd,
      absolute: true,
      onlyFiles: true,
      unique: true,
    });
    for (const p of paths) {
      const prev = byPath.get(p);
      if (prev === undefined || tier < prev) {
        byPath.set(p, tier);
      }
    }
  }

  const lockPath = getWorkspaceLockPath(workspaceRoot);
  if (existsSync(lockPath)) {
    try {
      const lock = await readLockFile(lockPath);
      const tierLock = 2;
      for (const pkg of lock.packages) {
        if (pkg.kind !== "skill") continue;
        const src = pkg.source.trim();
        if (!src.startsWith("file:")) continue;
        const rawPath = src.slice("file:".length);
        const baseDir = isAbsolute(rawPath)
          ? rawPath
          : join(workspaceRoot, rawPath);
        const skillMd = join(baseDir, "SKILL.md");
        if (!existsSync(skillMd)) continue;
        const prev = byPath.get(skillMd);
        if (prev === undefined || tierLock < prev) {
          byPath.set(skillMd, tierLock);
        }
      }
    } catch {
      /* unreadable or invalid lockfile — other tiers still apply */
    }
  }

  return [...byPath.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([path, tier]) => ({ path, tier }));
}

/** Discover skills under the workspace (and user/system tiers) as SkillMeta list. */
export async function discoverSkills(
  workspaceRoot: string,
): Promise<SkillMeta[]> {
  const entries = await discoverSkillEntries(workspaceRoot);
  return buildSkillIndex(entries);
}
