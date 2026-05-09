import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { PluginKind, PluginMeta } from "@kirakira/core";
import { getUserPluginsDir } from "@kirakira/core";

/**
 * Enumerate plugin package directories under user + workspace locations.
 * Convention: `~/.kirakira/plugins/<name>` and `<ws>/.kirakira/plugins/<name>`.
 */
export async function discoverPluginPaths(workspaceRoot?: string): Promise<string[]> {
  const out: string[] = [];
  const userRoot = getUserPluginsDir();
  try {
    const entries = await readdir(userRoot, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        out.push(join(userRoot, ent.name));
      }
    }
  } catch {
    /* optional dir */
  }

  if (workspaceRoot) {
    const ws = join(workspaceRoot, ".kirakira", "plugins");
    try {
      const entries = await readdir(ws, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          out.push(join(ws, ent.name));
        }
      }
    } catch {
      /* optional */
    }
  }

  return out;
}

export async function statPlugin(pluginPath: string): Promise<PluginMeta | undefined> {
  try {
    const st = await stat(pluginPath);
    if (!st.isDirectory()) return undefined;
    const base = pluginPath.split("/").pop() ?? pluginPath;
    const kind = inferKindFromName(base);
    let version = "0.0.0";
    try {
      const { readFile } = await import("node:fs/promises");
      const pkgRaw = await readFile(join(pluginPath, "package.json"), "utf-8");
      const pkg = JSON.parse(pkgRaw) as { version?: string };
      if (pkg.version) version = pkg.version;
    } catch {
      /* package.json is optional for plugins */
    }
    return {
      name: base,
      version,
      kind,
      enabled: true,
      path: pluginPath,
    };
  } catch {
    return undefined;
  }
}

function inferKindFromName(name: string): PluginKind {
  if (name.startsWith("registry")) return "registry";
  if (name.startsWith("renderer")) return "renderer";
  if (name.startsWith("import")) return "import-adapter";
  return "command";
}
