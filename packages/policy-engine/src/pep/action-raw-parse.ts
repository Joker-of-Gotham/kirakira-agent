export function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw))
    return raw as Record<string, unknown>;
  return undefined;
}

export function stringsFrom(record: Record<string, unknown>, ...keys: string[]): string[] {
  const acc: string[] = [];
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.length > 0) acc.push(v);
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === "string" && x.length > 0) acc.push(x);
      }
    }
  }
  return acc;
}

export function coerceEnv(record: Record<string, unknown>): Record<string, string> | undefined {
  const raw = record.env;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return undefined;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw))
    if (typeof v === "string") env[k] = v;
  return Object.keys(env).length > 0 ? env : undefined;
}
