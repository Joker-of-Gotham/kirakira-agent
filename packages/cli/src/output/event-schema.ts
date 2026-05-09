import { z } from "zod";
import {
  execResultSchema,
  outputEventSchema,
} from "@kirakira/core";

export { execResultSchema, outputEventSchema };

export const outputEventType = outputEventSchema.shape.event;

/** One JSON object for `kirakira-agent exec --json` final result line. */
export const execJsonEnvelopeSchema = z.object({
  kind: z.literal("exec.result"),
  result: execResultSchema,
});

export const outputEventBatchSchema = z.array(outputEventSchema);

export type OutputEventParsed = z.infer<typeof outputEventSchema>;
export type ExecResultParsed = z.infer<typeof execResultSchema>;
