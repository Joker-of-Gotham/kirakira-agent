import type { McpClientManager } from "@kirakira/mcp-adapter";

import type { RuntimeCapabilityScope, ToolSchema } from "../types.js";
import { scopeAllowsToolName } from "../runtime-scope.js";

function asToolList(result: unknown): Array<{
  name: string;
  description?: string;
  inputSchema?: unknown;
}> {
  if (!result || typeof result !== "object") return [];
  const r = result as { tools?: unknown };
  if (!Array.isArray(r.tools)) return [];
  return r.tools.filter(
    (t): t is { name: string; description?: string; inputSchema?: unknown } =>
      typeof t === "object" && t !== null && typeof (t as { name?: unknown }).name === "string",
  );
}

export class ToolRegistry {
  private readonly lazy = new Map<string, ToolSchema>();
  private readonly eager = new Map<string, ToolSchema>();

  register(tool: ToolSchema): void {
    this.eager.set(tool.name, tool);
  }

  fork(scope?: RuntimeCapabilityScope): ToolRegistry {
    const forked = new ToolRegistry();
    for (const tool of this.all()) {
      if (!scopeAllowsToolName(scope, tool.name)) continue;
      forked.register({
        ...tool,
        inputSchema: { ...tool.inputSchema },
        ...(tool.policyHints !== undefined ? { policyHints: { ...tool.policyHints } } : {}),
      });
    }
    return forked;
  }

  async discover(manager: McpClientManager, serverNames: string[]): Promise<ToolSchema[]> {
    const out: ToolSchema[] = [];
    for (const server of serverNames) {
      try {
        const raw = await manager.request(server, "tools/list", {});
        const tools = asToolList(raw);
        for (const t of tools) {
          const desc = typeof t.description === "string" ? t.description : "";
          const entry: ToolSchema = {
            name: `${server}:${t.name}`,
            description: desc.slice(0, 4000),
            inputSchema:
              t.inputSchema && typeof t.inputSchema === "object"
                ? (t.inputSchema as Record<string, unknown>)
                : { type: "object", properties: {} },
          };
          this.lazy.set(entry.name, entry);
          out.push(entry);
        }
      } catch {
        continue;
      }
    }
    return out;
  }

  get(name: string): ToolSchema | undefined {
    return this.eager.get(name) ?? this.lazy.get(name);
  }

  search(query: string, limit: number): ToolSchema[] {
    const q = query.toLowerCase();
    const all = [...this.eager.values(), ...this.lazy.values()];
    const uniq = new Map<string, ToolSchema>();
    for (const t of all) uniq.set(t.name, t);
    const ranked = [...uniq.values()]
      .map((t) => ({
        t,
        s:
          (t.name.toLowerCase().includes(q) ? 3 : 0) +
          (t.description.toLowerCase().includes(q) ? 1 : 0),
      }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return ranked.slice(0, limit).map((x) => x.t);
  }

  hydrateFullSchema(name: string): ToolSchema | undefined {
    const t = this.get(name);
    if (!t) return undefined;
    this.eager.set(name, t);
    return t;
  }

  all(): ToolSchema[] {
    const m = new Map<string, ToolSchema>();
    for (const t of this.lazy.values()) m.set(t.name, t);
    for (const t of this.eager.values()) m.set(t.name, t);
    return [...m.values()];
  }
}
