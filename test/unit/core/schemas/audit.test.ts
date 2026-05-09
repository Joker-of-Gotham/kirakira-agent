import { describe, expect, it } from "vitest";
import { auditEventSchema, auditCheckpointSchema } from "@kirakira/core";

describe("auditEventSchema", () => {
  it("accepts a complete policy.decision audit event", () => {
    const raw = {
      event_id: "aud-evt-01JABCDE",
      ts: "2026-05-04T12:00:00.000Z",
      segment: "seg-prod-us-east-1-a",
      prev_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      entry_hash: "sha256:91e7c9e3b4c4d4c2b2b1a0f8e7d6c5b4a392817161514131211100f0e0d0c0b",
      trace_id: "trace-policy-decision-4421",
      decision_id: "dec-allow-sbx-001",
      kind: "policy.decision",
      actor: {
        user_id: "principal-alex",
        interactive: true,
        agent_id: "kirakira-agent@v0.1.0",
        subagent_id: "sub-planner-04",
      },
      subject: {
        tool_type: "shell",
        tool_name: "bash",
        command_base: "pnpm",
      },
      result: {
        effect: "allow",
        approval_required: true,
        approval_status: "pending",
        sandbox_profile: "workspace-write",
        reason_codes: [],
        status: "pending",
      },
      metrics: {
        token_in: 0,
        token_out: 0,
        cost_usd: 0,
        latency_ms: 4.2,
      },
      integrity: {
        bundle_id: "@enterprise/kirakira-shell-policy",
        bundle_digest: "sha256:policybundle0102030405060708090a0b0c0d0e0f",
        input_hash: "sha256:inputCanonicalizedJson",
        output_hash: "sha256:decisionEnvelopeJson",
      },
    };
    const r = auditEventSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.version).toBe("kirakira.audit.v1");
      expect(r.data.kind).toBe("policy.decision");
      expect(r.data.decision_id).toBe("dec-allow-sbx-001");
    }
  });

  it("accepts a minimal audit event", () => {
    const raw = {
      event_id: "aud-evt-min-02",
      ts: "2026-05-04T13:45:01.234Z",
      segment: "default",
      prev_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      entry_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      trace_id: "trace-minimal",
      kind: "session.start",
      actor: {
        user_id: "svc-kirakira-batch",
        interactive: false,
      },
      subject: {},
      result: {},
    };
    const r = auditEventSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.metrics).toBeUndefined();
      expect(r.data.integrity).toBeUndefined();
      expect(r.data.decision_id).toBeUndefined();
    }
  });

  it("rejects invalid kind", () => {
    const base = {
      event_id: "e-bad-kind",
      ts: "2026-05-04T12:00:00.000Z",
      segment: "s",
      prev_hash: "h0",
      entry_hash: "h1",
      trace_id: "t",
      kind: "policy.decision",
      actor: { user_id: "u", interactive: false },
      subject: {},
      result: {},
    };
    const r = auditEventSchema.safeParse({
      ...base,
      kind: "invalid",
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid timestamp", () => {
    const raw = {
      event_id: "e-bad-ts",
      ts: "not-a-date",
      segment: "s",
      prev_hash: "h0",
      entry_hash: "h1",
      trace_id: "t",
      kind: "error",
      actor: { user_id: "u", interactive: false },
      subject: {},
      result: { status: "error", error_message: "clock skew" },
    };
    const r = auditEventSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });

  it("preserves hash chain fields", () => {
    const prev =
      "sha256:aabbccddeeff0011223344556677889900aabbccddeeff0011223344556677";
    const entry =
      "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdead";
    const raw = {
      event_id: "ev-chain",
      ts: "2026-05-05T09:15:43.999Z",
      segment: "chain-7",
      prev_hash: prev,
      entry_hash: entry,
      trace_id: "trace-chain-test",
      kind: "config.change",
      actor: {
        user_id: "admin-ops",
        interactive: false,
        agent_id: "config-bot",
      },
      subject: { skill_id: "@kirakira/policy-loader" },
      result: {
        status: "success",
        reason_codes: ["config_applied"],
      },
    };
    const r = auditEventSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.prev_hash).toBe(prev);
      expect(r.data.entry_hash).toBe(entry);
    }
  });

  it("accepts tool.exec event with metrics", () => {
    const raw = {
      event_id: "aud-tool-exec-compact",
      ts: "2026-05-04T18:22:55.050Z",
      segment: "ingest-batch-12",
      prev_hash:
        "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      entry_hash:
        "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      trace_id: "trace-token-heavy-run",
      kind: "tool.exec",
      actor: {
        user_id: "user-research",
        interactive: true,
      },
      subject: {
        tool_type: "mcp",
        tool_name: "omni-query",
      },
      result: {
        effect: "allow",
        status: "success",
      },
      metrics: {
        latency_ms: 1480,
        token_in: 12540,
        token_out: 3021,
        cost_usd: 0.0412,
      },
    };
    const r = auditEventSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.metrics?.latency_ms).toBe(1480);
      expect(r.data.metrics?.token_in).toBe(12540);
      expect(r.data.metrics?.token_out).toBe(3021);
    }
  });
});

describe("auditCheckpointSchema", () => {
  it("accepts valid checkpoint", () => {
    const raw = {
      segment: "seg-prod-us-east-1-a",
      first_event_id: "aud-evt-000001",
      last_event_id: "aud-evt-010240",
      entries: 10240,
      root_hash:
        "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      signed_at: "2026-05-04T23:59:59.000Z",
      signer: {
        type: "ed25519",
        key_id: "kid:corp-audit-root-2026-q2",
      },
      signature:
        "signature:base64:MEUCIQDExampleEd25519DetachedSignatureRepresentativeMaterial",
    };
    const r = auditCheckpointSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.version).toBe("kirakira.audit.checkpoint.v1");
      expect(r.data.signer.type).toBe("ed25519");
      expect(r.data.entries).toBe(10240);
    }
  });

  it("rejects non-integer entries count", () => {
    const raw = {
      segment: "s",
      first_event_id: "a",
      last_event_id: "b",
      entries: 1.5,
      root_hash: "r",
      signed_at: "2026-05-04T12:00:00.000Z",
      signer: { type: "ed25519", key_id: "k" },
      signature: "sig",
    };
    const r = auditCheckpointSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });

  it("requires ed25519 signer type", () => {
    const raw = {
      segment: "s",
      first_event_id: "a",
      last_event_id: "b",
      entries: 3,
      root_hash: "r",
      signed_at: "2026-05-04T12:00:00.000Z",
      signer: { type: "rsa-pss", key_id: "kid-rsa-1" },
      signature: "sig",
    };
    const r = auditCheckpointSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });
});
