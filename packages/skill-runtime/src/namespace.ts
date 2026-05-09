export type SkillNamespace =
  | "cursor"
  | "claude"
  | "codex"
  | "copilot"
  | "gemini"
  | "kirakira";

const known: ReadonlySet<string> = new Set<SkillNamespace>([
  "cursor",
  "claude",
  "codex",
  "copilot",
  "gemini",
  "kirakira",
]);

/** Attach vendor namespace to imported skills (e.g. `cursor:lint`). */
export function withNamespace(ns: SkillNamespace, skillName: string): string {
  return `${ns}:${skillName}`;
}

export function parseSkillRef(ref: string): {
  namespace?: SkillNamespace;
  name: string;
} {
  const i = ref.indexOf(":");
  if (i === -1) {
    return { name: ref };
  }
  const ns = ref.slice(0, i);
  const name = ref.slice(i + 1);
  if (known.has(ns)) {
    return { namespace: ns as SkillNamespace, name };
  }
  return { name: ref };
}

/** Apply default vendor prefix when importing external skills. */
export function autoPrefixExternal(
  skillName: string,
  importedFrom: SkillNamespace,
): string {
  const { namespace, name } = parseSkillRef(skillName);
  if (namespace) {
    return `${namespace}:${name}`;
  }
  return withNamespace(importedFrom, name);
}
