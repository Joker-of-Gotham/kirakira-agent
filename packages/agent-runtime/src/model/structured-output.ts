import { StructuredOutputError } from "../errors.js";

export function buildStructuredPrompt(schema: Record<string, unknown>): string {
  return [
    "Respond with a single JSON object only, no markdown fences, matching this JSON Schema shape:",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}

export function parseStructuredOutput<T>(raw: string, schema: Record<string, unknown>): T {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new StructuredOutputError("No JSON object found in model output");
  }
  const json = trimmed.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new StructuredOutputError(`JSON parse failed: ${msg}`);
  }

  const required = schema.required;
  if (Array.isArray(required) && typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const missing = required.filter(
      (k): k is string => typeof k === "string" && !(k in obj),
    );
    if (missing.length > 0) {
      throw new StructuredOutputError(
        `Missing required fields: ${missing.join(", ")}`,
      );
    }
  }

  return parsed as T;
}
