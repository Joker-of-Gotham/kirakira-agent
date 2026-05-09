import { useState, useEffect } from "react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadRegistryAuth } from "../../registry/auth.js";

export interface FirstRunCheck {
  hasAuth: boolean;
  hasConfig: boolean;
  compatDetected: string[];
  trust: string;
}

interface UseFirstRunReturn {
  checks: FirstRunCheck | null;
  done: boolean;
}

export function useFirstRun(workspaceRoot: string, trust: string): UseFirstRunReturn {
  const [checks, setChecks] = useState<FirstRunCheck | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      const hasAuth = await checkAuth();
      const hasConfig = existsSync(join(workspaceRoot, "agent.toml"));
      const compatDetected: string[] = [];

      if (existsSync(join(workspaceRoot, ".cursor", "mcp.json")))
        compatDetected.push("cursor");
      if (existsSync(join(workspaceRoot, ".claude", "skills")))
        compatDetected.push("claude");
      if (existsSync(join(workspaceRoot, ".codex", "config.toml")))
        compatDetected.push("codex");
      if (existsSync(join(workspaceRoot, ".github", "copilot")))
        compatDetected.push("copilot");

      setChecks({ hasAuth, hasConfig, compatDetected, trust });
      setDone(true);
    })();
  }, [workspaceRoot, trust]);

  return { checks, done };
}

async function checkAuth(): Promise<boolean> {
  try {
    const auth = await loadRegistryAuth();
    return auth !== null && auth !== undefined;
  } catch {
    return false;
  }
}
