import { describe, it, expect } from "vitest";
import type { AuditEvent } from "@kirakira/core";
import { mapToEcs } from "@kirakira/audit-ledger";

function minimalAuditEvent(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    version: "kirakira.audit.v1",
    event_id: "ecs-e1",
    ts: "2026-05-05T14:30:00.000Z",
    segment: "2026-05-05-0001",
    prev_hash:
      "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b75cc8498c8c32d7c5",
    entry_hash: "c".repeat(64),
    trace_id: "trace-ecs",
    kind: "policy.decision",
    actor: { user_id: "user-policy", interactive: true },
    subject: {},
    result: { effect: "allow" },
    ...overrides,
  };
}

describe("mapToEcs", () => {
  it("maps policy.decision event to ECS format", () => {
    const ecs = mapToEcs(minimalAuditEvent({}));
    expect(ecs["@timestamp"]).toBe("2026-05-05T14:30:00.000Z");
    expect(ecs.event.category).toBe("iam");
    expect(ecs.event.action).toBe("policy:decision");
    expect(ecs.user.id).toBe("user-policy");
    expect(ecs.trace?.id).toBe("trace-ecs");
  });

  it("maps deny effect to event.outcome=failure", () => {
    const ecs = mapToEcs(
      minimalAuditEvent({
        result: { effect: "deny" },
      }),
    );
    expect(ecs.event.outcome).toBe("failure");
  });

  it("maps allow effect to event.outcome=success", () => {
    const ecs = mapToEcs(
      minimalAuditEvent({
        result: { effect: "allow" },
      }),
    );
    expect(ecs.event.outcome).toBe("success");
  });
});
