import { loadSkill } from "@kirakira/skill-runtime";

import type { SkillHint, SkillRegistration } from "../types.js";

export class SkillInjector {
  private readonly tiers = new Map<string, "advertised" | "loaded" | "materialized">();
  private readonly registry: Map<string, SkillRegistration>;

  constructor(registry: Iterable<SkillRegistration>) {
    this.registry = new Map();
    for (const r of registry) {
      this.registry.set(r.name, r);
      this.tiers.set(r.name, "advertised");
    }
  }

  getAdvertised(allowedNames?: readonly string[]): SkillHint[] {
    const allowed = allowedNames !== undefined ? new Set(allowedNames) : undefined;
    const out: SkillHint[] = [];
    for (const r of this.registry.values()) {
      if (allowed !== undefined && !allowed.has(r.name)) continue;
      out.push({
        name: r.name,
        description: r.description,
        version: r.version,
        tier: this.tiers.get(r.name) ?? "advertised",
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  promote(skillName: string, to: "loaded" | "materialized"): void {
    if (!this.registry.has(skillName)) {
      throw new Error(`Unknown skill: ${skillName}`);
    }
    this.tiers.set(skillName, to);
  }

  getInjectionContent(
    tierFilter: "advertised" | "loaded" | "materialized",
    allowedNames?: readonly string[],
  ): string {
    const allowed = allowedNames !== undefined ? new Set(allowedNames) : undefined;
    if (tierFilter === "advertised") {
      const lines: string[] = [];
      for (const r of this.registry.values()) {
        if (allowed !== undefined && !allowed.has(r.name)) continue;
        const tier = this.tiers.get(r.name) ?? "advertised";
        if (tier === "advertised") {
          lines.push(`- **${r.name}** (v${r.version}): ${r.description}`);
        }
      }
      return lines.join("\n");
    }

    if (tierFilter === "loaded") {
      const blocks: string[] = [];
      for (const r of this.registry.values()) {
        if (allowed !== undefined && !allowed.has(r.name)) continue;
        const tier = this.tiers.get(r.name) ?? "advertised";
        if (tier === "loaded") {
          const body = loadSkill(r.path).materialize().body;
          blocks.push(`### ${r.name}\n${body}`);
        }
      }
      return blocks.join("\n\n");
    }

    const blocks: string[] = [];
    for (const r of this.registry.values()) {
      if (allowed !== undefined && !allowed.has(r.name)) continue;
      const tier = this.tiers.get(r.name) ?? "advertised";
      if (tier === "materialized") {
        const mat = loadSkill(r.path).materialize();
        const extras = [
          `Scripts: ${mat.scripts.length ? mat.scripts.join(", ") : "(none)"}`,
          `Asset references: ${mat.references.length ? mat.references.join(", ") : "(none)"}`,
        ].join("\n");
        blocks.push(`### ${r.name}\n${mat.body}\n\n${extras}`);
      }
    }
    return blocks.join("\n\n");
  }

  materializedPaths(skillName: string): string {
    const r = this.registry.get(skillName);
    if (!r) throw new Error(`Unknown skill: ${skillName}`);
    const tier = this.tiers.get(skillName) ?? "advertised";
    if (tier !== "materialized") {
      throw new Error(`Skill ${skillName} is not materialized`);
    }
    const { scripts, references } = loadSkill(r.path).materialize();
    return [
      `Skill: ${skillName}`,
      `Scripts: ${scripts.join(", ")}`,
      `References: ${references.join(", ")}`,
    ].join("\n");
  }
}
