import type { ExecResult } from "@kirakira/core";
import { execJsonEnvelopeSchema } from "./event-schema.js";

/** Serialize a single JSON object for `exec --json` (newline optional for caller). */
export function serializeExecJson(result: ExecResult): string {
  const payload = execJsonEnvelopeSchema.parse({
    kind: "exec.result",
    result,
  });
  return JSON.stringify(payload);
}
