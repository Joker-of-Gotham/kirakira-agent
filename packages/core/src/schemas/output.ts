import { z } from "zod";

export const outputEventType = z.enum([
  "session.start",
  "session.finish",
  "attachment.resolved",
  "skill.activated",
  "mcp.invoke",
  "approval.requested",
  "approval.decided",
  "shell.executed",
  "output.artifact",
  "error",
]);

export const outputEventSchema = z.object({
  ts: z.string().datetime(),
  event: outputEventType,
  sessionId: z.string().startsWith("ses_"),
  traceId: z.string().min(16),
  data: z.record(z.unknown()).optional(),
});

export const execResultSchema = z.object({
  sessionId: z.string().startsWith("ses_"),
  traceId: z.string().min(16),
  status: z.enum(["ok", "error"]),
  mode: z.literal("exec"),
  result: z
    .object({
      summary: z.string(),
      artifacts: z.array(z.string()),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  usage: z
    .object({
      tokenIn: z.number().int().nonnegative(),
      tokenOut: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
      durationMs: z.number().int().nonnegative(),
    })
    .optional(),
});
