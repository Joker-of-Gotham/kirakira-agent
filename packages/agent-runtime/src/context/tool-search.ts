import { createHash } from "node:crypto";

import type { ToolSchema, ToolSearchHit } from "../types.js";

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((t) => t.length > 1);
}

function scoreTool(query: string, tool: ToolSchema): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const hay = `${tool.name} ${tool.description}`.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (hay.includes(t)) s += 2;
    if (tool.name.toLowerCase().includes(t)) s += 3;
  }
  return s;
}

export class ToolSearchEngine {
  private readonly summaryByName = new Map<string, Pick<ToolSchema, "name" | "description">>();
  private readonly fullByName = new Map<string, ToolSchema>();

  indexTools(tools: ToolSchema[]): void {
    for (const t of tools) {
      this.fullByName.set(t.name, t);
      this.summaryByName.set(t.name, { name: t.name, description: t.description });
    }
  }

  capabilitySearch(query: string, budget: number): ToolSchema[] {
    const scored: ToolSearchHit[] = [];
    for (const [name, { description }] of this.summaryByName) {
      const full = this.fullByName.get(name);
      if (!full) continue;
      const sc = scoreTool(query, full);
      if (sc > 0) scored.push({ name, description, score: sc });
    }
    scored.sort((a, b) => b.score - a.score);
    const out: ToolSchema[] = [];
    let used = 0;
    for (const h of scored) {
      const preview: ToolSchema = {
        name: h.name,
        description: h.description,
        inputSchema: { type: "object", description: "Full schema loaded on selection." },
      };
      const cost = Math.ceil((preview.name.length + preview.description.length) / 4);
      if (used + cost > budget) break;
      used += cost;
      out.push(preview);
    }
    return out;
  }

  search(query: string, budget: number): ToolSchema[] {
    return this.capabilitySearch(query, budget);
  }

  getFullSchema(toolName: string): ToolSchema | null {
    return this.fullByName.get(toolName) ?? null;
  }

  /**
   * Register an external tool where only name and description are known (e.g. MCP
   * tools before their full JSON schema is fetched). A deferred schema entry is
   * created so it appears in capability searches; the actual inputSchema is fetched
   * lazily via getFullSchema when the model selects this tool.
   */
  registerLazyTool(tool: Pick<ToolSchema, "name" | "description">): void {
    const hash = createHash("sha256").update(tool.name).digest("hex").slice(0, 16);
    const deferredEntry: ToolSchema = {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object",
        $comment: `deferred:${hash}`,
        description: "Full schema loaded on selection via getFullSchema()",
      },
    };
    this.summaryByName.set(tool.name, { name: tool.name, description: tool.description });
    if (!this.fullByName.has(tool.name)) {
      this.fullByName.set(tool.name, deferredEntry);
    }
  }

}
