/**
 * JSON Canonicalization (RFC 8785 / JCS) — deterministic serialization.
 * Object keys sorted lexicographically (Unicode scalar values via localeCompare default for ASCII keys).
 */

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) {
      continue;
    }
    out[k] = canonicalize(v);
  }
  return out;
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("canonicalJson: NaN / Infinity cannot be canonically serialized");
  }
  /* Integers within safe integer range: omit scientific notation via String() */
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) {
    return String(n);
  }
  /*
   * Fallback to JSON.stringify numeric rules (ES Number::toJSON behavior for floats).
   */
  return JSON.stringify(n);
}

function serialize(value: unknown): string {
  if (value === undefined) {
    throw new Error("canonicalJson: top-level undefined is invalid");
  }
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return serializeNumber(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((e) => serialize(e)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    const parts = keys.flatMap((k) => {
      const v = obj[k];
      if (v === undefined) {
        return [];
      }
      return `${JSON.stringify(k)}:${serialize(v)}`;
    });
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

/** Deterministic RFC 8785–style serialization (minimal whitespace). */
export function canonicalJson(obj: unknown): string {
  return serialize(canonicalize(obj));
}
