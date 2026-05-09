import type { NormalizerResult } from "../normalizer/action-normalizer.js";

/** Compact risk tokens derived from PEP normalization artifacts. */
export function signalize(normalized: NormalizerResult, tag: string): string[] {
  const s = new Set<string>([
    `policy.pep.${tag}`,
    ...normalized.flags.map((f) => `flag:${f}`),
  ]);
  if (normalized.destructive) s.add("risk.destructive");
  if (normalized.pipeline_depth > 0) s.add("risk.pipeline");
  if (normalized.interpreter_handoff) s.add("risk.interpreter_handoff");
  if (normalized.network?.required) s.add("risk.network.required");
  for (const d of normalized.network?.domains ?? []) s.add(`network.domain.${d}`);
  return [...s];
}
