/**
 * RFC 8785–style deterministic JSON serialization (JCS approximation):
 * Unicode code point lexicographic key sorting, compact output,
 * integers serialized without exponent notation.
 */

function escapeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const code = c.charCodeAt(0);
    if (c === '"') out += '\\"';
    else if (c === "\\") out += "\\\\";
    else if (c === "\b") out += "\\b";
    else if (c === "\f") out += "\\f";
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else if (code < 0x20) out += "\\u" + code.toString(16).padStart(4, "0");
    else out += c;
  }
  return out + '"';
}

function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error("canonicalJson: non-finite number");
  if (Number.isInteger(n)) return String(Math.trunc(n));
  const s = String(n);
  if (/e|E/.test(s))
    throw new Error("canonicalJson: scientific notation unsupported for fractional numbers");
  return s;
}

export function canonicalJson(obj: unknown): string {
  if (obj === null) return "null";
  const t = typeof obj;
  if (t === "boolean") return obj ? "true" : "false";
  if (t === "number") return encodeNumber(obj as number);
  if (t === "bigint") return (obj as bigint).toString();
  if (t === "string") return escapeString(obj as string);
  if (t === "undefined") throw new Error("canonicalJson: undefined value");
  if (Array.isArray(obj)) {
    return "[" + obj.map((e) => canonicalJson(e)).join(",") + "]";
  }
  if (t !== "object") throw new Error(`canonicalJson: unsupported type ${t}`);
  if (obj instanceof Date) throw new Error("canonicalJson: Date unsupported");
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec).sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
  const pairs: string[] = [];
  for (const k of keys) {
    const v = rec[k];
    if (v === undefined) continue;
    pairs.push(`${escapeString(k)}:${canonicalJson(v)}`);
  }
  return "{" + pairs.join(",") + "}";
}
