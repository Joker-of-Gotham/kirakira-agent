import { createHash } from "blake3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AuditCheckpoint } from "@kirakira/core";
import {
  generateCheckpoint,
  LedgerReader,
  LedgerSigner,
  LedgerVerifier,
  LedgerWriter,
  canonicalCheckpointSigningBytes,
} from "@kirakira/audit-ledger";
import { createTempLedgerDir, removeTempDir, uniqueEvent } from "./helpers.js";

function expectedCheckpointRoot(entryHashesHex: string[]): string {
  const h = createHash();
  for (const hex of entryHashesHex) {
    h.update(Buffer.from(hex, "utf8"));
  }
  return h.digest("hex");
}

describe("checkpoint + signing", () => {
  let baseDir: string;
  let keysDir: string;

  beforeEach(async () => {
    baseDir = await createTempLedgerDir();
    keysDir = await mkdtemp(join(tmpdir(), "audit-ledger-keys-"));
  });

  afterEach(async () => {
    await removeTempDir(baseDir);
    await rm(keysDir, { recursive: true, force: true });
  });

  it("generates checkpoint with correct root hash", async () => {
    const w = new LedgerWriter({ baseDir });
    const hashes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const e = await w.append(uniqueEvent({ event_id: `cp-${i}` }));
      hashes.push(e.entry_hash);
    }
    await w.close();

    const segmentId = (await new LedgerReader(baseDir).listSegmentIdsSorted())[0]!;
    const reader = new LedgerReader(baseDir);
    const cp = await generateCheckpoint(reader, segmentId);
    expect(cp.rootHash).toBe(expectedCheckpointRoot(hashes));
  });

  it("checkpoint contains correct entry count", async () => {
    const w = new LedgerWriter({ baseDir });
    for (let i = 0; i < 7; i++) {
      await w.append(uniqueEvent({ event_id: `n-${i}` }));
    }
    await w.close();
    const segmentId = (await new LedgerReader(baseDir).listSegmentIdsSorted())[0]!;
    const cp = await generateCheckpoint(new LedgerReader(baseDir), segmentId);
    expect(cp.entries).toBe(7);
  });

  it("signs checkpoint with Ed25519", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(uniqueEvent({ event_id: "sign-1" }));
    await w.append(uniqueEvent({ event_id: "sign-2" }));
    await w.close();

    const { privateKeyPath, publicKeyPath, keyId } =
      await LedgerSigner.generateKeyPair(keysDir);
    const signer = await LedgerSigner.load(privateKeyPath);
    const segmentId = (await new LedgerReader(baseDir).listSegmentIdsSorted())[0]!;
    const ck = await generateCheckpoint(new LedgerReader(baseDir), segmentId);

    const payload: Omit<AuditCheckpoint, "signature"> = {
      version: "kirakira.audit.checkpoint.v1",
      segment: ck.segment,
      first_event_id: ck.firstEventId,
      last_event_id: ck.lastEventId,
      entries: ck.entries,
      root_hash: ck.rootHash,
      signed_at: "2026-05-05T18:00:00.000Z",
      signer: { type: "ed25519", key_id: keyId },
    };
    const signingBytes = canonicalCheckpointSigningBytes(payload);
    const sig = await signer.sign(signingBytes);

    const full: AuditCheckpoint = { ...payload, signature: sig };
    const verifier = new LedgerVerifier(publicKeyPath);
    expect(await verifier.verifyCheckpoint(full)).toBe(true);
  });

  it("rejects invalid signature", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(uniqueEvent());
    await w.close();

    const { privateKeyPath, publicKeyPath, keyId } =
      await LedgerSigner.generateKeyPair(keysDir);
    const signer = await LedgerSigner.load(privateKeyPath);
    const segmentId = (await new LedgerReader(baseDir).listSegmentIdsSorted())[0]!;
    const ck = await generateCheckpoint(new LedgerReader(baseDir), segmentId);

    const payload: Omit<AuditCheckpoint, "signature"> = {
      version: "kirakira.audit.checkpoint.v1",
      segment: ck.segment,
      first_event_id: ck.firstEventId,
      last_event_id: ck.lastEventId,
      entries: ck.entries,
      root_hash: ck.rootHash,
      signed_at: "2026-05-05T18:00:00.000Z",
      signer: { type: "ed25519", key_id: keyId },
    };
    const sig = await signer.sign(canonicalCheckpointSigningBytes(payload));

    const tampered: AuditCheckpoint = {
      ...payload,
      root_hash: "b".repeat(64),
      signature: sig,
    };
    const verifier = new LedgerVerifier(publicKeyPath);
    expect(await verifier.verifyCheckpoint(tampered)).toBe(false);
  });
});
