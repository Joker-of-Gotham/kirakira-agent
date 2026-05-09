import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AuditCheckpoint, AuditEvent } from "@kirakira/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  AuditIndex,
  LedgerReader,
  LedgerSigner,
  LedgerVerifier,
  LedgerWriter,
  SiemExporter,
  canonicalCheckpointSigningBytes,
  generateCheckpoint,
} from "@kirakira/audit-ledger";
import {
  createTempLedgerDir,
  removeTempDir,
  uniqueEvent,
} from "../../unit/audit-ledger/helpers.js";

describe("audit ledger end-to-end", () => {
  let keysDir: string;

  beforeEach(async () => {
    keysDir = await mkdtemp(join(tmpdir(), "kirakira-audit-keys-int-"));
  });

  afterEach(async () => {
    await rm(keysDir, { recursive: true, force: true });
  });

  it("writes 100 events, auto-rotates segments, generates checkpoint, signs, and verifies", async () => {
    const baseDir = await createTempLedgerDir();
    try {
      const w = new LedgerWriter({ baseDir, maxEntriesPerSegment: 35 });
      for (let i = 0; i < 100; i++) {
        await w.append(uniqueEvent({ event_id: `e2e-${i}` }));
      }
      await w.close();

      const reader = new LedgerReader(baseDir);
      const segments = await reader.listSegmentIdsSorted();
      expect(segments.length).toBeGreaterThanOrEqual(2);

      const segment0 = segments[0]!;
      const chainOk = await reader.verifySegmentChain(segment0);
      expect(chainOk.errors).toEqual([]);

      const cp = await generateCheckpoint(reader, segment0);

      const { privateKeyPath, publicKeyPath, keyId } = await LedgerSigner.generateKeyPair(keysDir);
      const signer = await LedgerSigner.load(privateKeyPath);
      const payload: Omit<AuditCheckpoint, "signature"> = {
        version: "kirakira.audit.checkpoint.v1",
        segment: cp.segment,
        first_event_id: cp.firstEventId,
        last_event_id: cp.lastEventId,
        entries: cp.entries,
        root_hash: cp.rootHash,
        signed_at: "2026-05-05T18:05:05.000Z",
        signer: { type: "ed25519", key_id: keyId },
      };

      const signingBytes = canonicalCheckpointSigningBytes(payload);
      const checkpoint: AuditCheckpoint = {
        ...payload,
        signature: await signer.sign(signingBytes),
      };

      const verifier = new LedgerVerifier(publicKeyPath);
      expect(await verifier.verifyCheckpoint(checkpoint)).toBe(true);
    } finally {
      await removeTempDir(baseDir);
    }
  });

  it("rebuilds SQLite index from JSONL and queries match", async () => {
    const baseDir = await createTempLedgerDir();
    const dbOne = join(baseDir, "index-a.db");
    const dbTwo = join(baseDir, "index-b.db");
    try {
      const trace = `trace-${Math.random().toString(36).slice(2)}`;
      const w = new LedgerWriter({ baseDir });
      for (let i = 0; i < 25; i++) {
        await w.append(uniqueEvent({ trace_id: trace, event_id: `idx-${i}` }));
      }
      await w.close();

      const reader = new LedgerReader(baseDir);
      const ixA = new AuditIndex(dbOne);
      const ixB = new AuditIndex(dbTwo);

      for (const seg of await reader.listSegmentIdsSorted()) {
        for await (const ev of reader.readSegment(seg)) {
          ixA.indexEvent(ev);
        }
      }
      for (const seg of await reader.listSegmentIdsSorted()) {
        for await (const ev of reader.readSegment(seg)) {
          ixB.indexEvent(ev);
        }
      }

      const rowsA = ixA.queryByTraceId(trace).map((r) => r.event_id).sort();
      const rowsB = ixB.queryByTraceId(trace).map((r) => r.event_id).sort();
      expect(rowsA).toEqual(rowsB);
      expect(rowsA.length).toBe(25);

      ixA.close();
      ixB.close();
    } finally {
      await removeTempDir(baseDir);
    }
  });

  it("exports to ECS JSON format with correct field mapping", () => {
    const exporter = new SiemExporter("ecs-json");
    const audit: AuditEvent = {
      version: "kirakira.audit.v1",
      event_id: "ecs-export-int",
      ts: "2026-05-05T16:45:30.250Z",
      segment: "2026-05-05-0999",
      prev_hash:
        "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b75cc8498c8c32d7c5",
      entry_hash: "d".repeat(64),
      trace_id: "trace-ecs-export",
      kind: "approval.request",
      actor: { user_id: "u-ecs", interactive: false },
      subject: { tool_name: "shell", command_base: "npm" },
      result: {
        approval_required: true,
        approval_status: "pending",
        effect: "escalate",
      },
    };
    const out = exporter.export([audit]).trim().split(/\n/).filter(Boolean)[0];
    expect(out).toBeDefined();
    const ecs = JSON.parse(out!) as {
      "@timestamp": string;
      trace?: { id: string };
      event: { category: string; outcome: string };
    };
    expect(ecs["@timestamp"]).toBe("2026-05-05T16:45:30.250Z");
    expect(ecs.trace).toEqual(expect.objectContaining({ id: "trace-ecs-export" }));
    expect(ecs.event.category).toBeDefined();
    expect(ecs.event.outcome).toBe("deferred");
  });
});
