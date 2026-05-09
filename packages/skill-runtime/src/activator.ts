/**
 * Decide whether a skill should activate for a natural-language task string.
 * Patterns come from skill frontmatter `activation` (substring match; `*` glob).
 */
export function shouldActivateSkill(
  taskDescription: string,
  activationPatterns: string[] | undefined,
): boolean {
  if (!activationPatterns?.length) {
    return false;
  }
  const task = taskDescription.toLowerCase();
  return activationPatterns.some((raw) => {
    const p = raw.trim().toLowerCase();
    if (!p) return false;
    if (p.includes("*")) {
      const re = new RegExp(
        `^${p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
      );
      return re.test(task);
    }
    return task.includes(p);
  });
}

/**
 * `$skill` trigger pattern — extract skill name from `$skill_name` syntax.
 * Aligned with kirakira-agent-registry.md §Skills Registry trigger mechanism.
 *
 * Patterns: `$skillName`, `$skill-name`, `$skill_name`
 */
const DOLLAR_SKILL_RE = /\$([a-zA-Z][\w.-]*)/g;

export function extractDollarSkillTriggers(input: string): string[] {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  DOLLAR_SKILL_RE.lastIndex = 0;
  while ((m = DOLLAR_SKILL_RE.exec(input)) !== null) {
    matches.push(m[1]!);
  }
  return matches;
}

/**
 * Resolve `$skill` triggers against a catalog of known skill names.
 * Returns matched skill names (case-insensitive, dash/underscore normalized).
 */
export function resolveDollarSkills(
  input: string,
  catalog: ReadonlyArray<{ name: string }>,
): string[] {
  const triggers = extractDollarSkillTriggers(input);
  if (!triggers.length) return [];

  const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, "");
  const result: string[] = [];

  for (const trigger of triggers) {
    const normTrigger = normalize(trigger);
    const match = catalog.find((s) => normalize(s.name) === normTrigger);
    if (match) {
      result.push(match.name);
    }
  }

  return result;
}
