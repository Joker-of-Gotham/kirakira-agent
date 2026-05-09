import { homedir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { PATHS } from "../constants.js";

export function getUserHome(): string {
  return join(homedir(), PATHS.userHome);
}

export function getUserConfigPath(): string {
  return join(getUserHome(), PATHS.userConfig);
}

export function getUserSessionsDir(): string {
  return join(getUserHome(), PATHS.userSessions);
}

export function getUserTracesDir(): string {
  return join(getUserHome(), PATHS.userTraces);
}

export function getUserSkillsDir(): string {
  return join(getUserHome(), PATHS.userSkills);
}

export function getUserPluginsDir(): string {
  return join(getUserHome(), PATHS.userPlugins);
}

export function getUserCacheDir(): string {
  return join(getUserHome(), PATHS.userCache);
}

export function getUserRegistryAuthPath(): string {
  return join(getUserHome(), PATHS.userRegistryAuth);
}

export function getWorkspaceConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, PATHS.workspaceConfig);
}

export function getWorkspacePolicyPath(workspaceRoot: string): string {
  return join(workspaceRoot, PATHS.workspacePolicy);
}

export function getWorkspacePrivatePath(workspaceRoot: string): string {
  return join(workspaceRoot, PATHS.workspacePrivate);
}

export function getWorkspaceLockPath(workspaceRoot: string): string {
  return join(workspaceRoot, PATHS.workspaceLock);
}

export function getMcpConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, PATHS.mcpConfig);
}

/**
 * Ensure a path stays within a given root directory.
 * Prevents path traversal attacks.
 */
export function isPathWithin(rootDir: string, targetPath: string): boolean {
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(
    isAbsolute(targetPath) ? targetPath : join(rootDir, targetPath),
  );
  const rel = relative(resolvedRoot, resolvedTarget);
  return !rel.startsWith("..") && !isAbsolute(rel);
}
