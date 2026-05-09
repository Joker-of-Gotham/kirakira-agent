import { envExpandStr } from "@kirakira/core";

/** Expand `${VAR}` / `${VAR:-default}` in strings using `process.env` (same rules as shell defaults). */
export function resolveEnvInRecord(
  record: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = envExpandStr(v);
  }
  return out;
}
