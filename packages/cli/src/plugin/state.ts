import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getUserHome } from "@kirakira/core";

export type PluginState = { disabled: string[] };

function pluginStatePath(): string {
  return join(getUserHome(), "plugins-state.json");
}

export async function loadPluginState(): Promise<PluginState> {
  try {
    const raw = await readFile(pluginStatePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<PluginState>;
    return { disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [] };
  } catch {
    return { disabled: [] };
  }
}

export async function savePluginState(state: PluginState): Promise<void> {
  await mkdir(getUserHome(), { recursive: true });
  await writeFile(pluginStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
