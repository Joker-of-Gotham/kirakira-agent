import type { LineageTree, SubagentSpec } from "../types.js";

export class LineageTracker {
  private readonly children = new Map<string, Set<string>>();
  private readonly parentOf = new Map<string, string>();
  private readonly specs = new Map<string, SubagentSpec>();

  recordSpawn(parentId: string, childId: string, spec: SubagentSpec): void {
    let set = this.children.get(parentId);
    if (!set) {
      set = new Set();
      this.children.set(parentId, set);
    }
    set.add(childId);
    this.parentOf.set(childId, parentId);
    this.specs.set(childId, spec);
  }

  getChildren(parentId: string): string[] {
    return [...(this.children.get(parentId) ?? [])];
  }

  getAncestors(childId: string): string[] {
    const out: string[] = [];
    let cur = this.parentOf.get(childId);
    while (cur) {
      out.push(cur);
      cur = this.parentOf.get(cur);
    }
    return out;
  }

  getTree(rootId: string): LineageTree {
    const build = (id: string): LineageTree => ({
      id,
      children: this.getChildren(id).map((c) => build(c)),
    });
    return build(rootId);
  }
}
