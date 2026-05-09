import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { PATHS } from "@kirakira/core";

export function resolveConfigPaths(workspaceRoot: string, configOverride?: string) {
  const userHome = join(homedir(), PATHS.userHome);

  const agentToml = configOverride ?? findFirst([
    join(workspaceRoot, PATHS.workspaceConfig),
  ]);

  const policyYaml = findFirst([
    join(workspaceRoot, PATHS.workspacePolicy),
  ]);

  const localConfig = findFirst([
    join(workspaceRoot, PATHS.workspacePrivate),
  ]);

  const userConfig = findFirst([
    join(userHome, PATHS.userConfig),
  ]);

  return { agentToml, policyYaml, localConfig, userConfig, userHome };
}

function findFirst(candidates: string[]): string | undefined {
  return candidates.find((p) => existsSync(p));
}
