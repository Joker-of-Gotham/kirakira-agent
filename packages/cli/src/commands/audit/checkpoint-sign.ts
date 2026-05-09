import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Command, Flags } from "@oclif/core";
import type { AuditCheckpoint } from "@kirakira/core";
import {
  LedgerReader,
  LedgerSigner,
  canonicalCheckpointSigningBytes,
  generateCheckpoint,
  getAuditCheckpointDir,
  getAuditKeysDir,
  getAuditLedgerDir,
} from "@kirakira/audit-ledger";

export interface AuditCheckpointSignOptions {
  segment?: string;
  keysDir?: string;
}

async function locatePrivate(keysDir: string): Promise<string> {
  const names = await readdir(keysDir).catch(() => []);
  const hit = names.find((n) => n.endsWith(".ed25519.priv.hex"));
  if (!hit)
    throw new Error(
      `No Ed25519 private key (*.ed25519.priv.hex) found under ${keysDir}. Generate via LedgerSigner.generateKeyPair.`,
    );
  return join(keysDir, hit);
}

/** Sign BLAKE3 root hash for the freshest segment (or `--segment`). */
export async function auditCheckpointSign(options: AuditCheckpointSignOptions = {}): Promise<string> {
  const reader = new LedgerReader(getAuditLedgerDir());
  const segments = await reader.listSegmentIdsSorted();
  const segment = options.segment ?? segments[segments.length - 1] ?? "";

  if (!segment) throw new Error("Ledger is empty — nothing to checkpoint");

  const summary = await generateCheckpoint(reader, segment);
  const keysDir = options.keysDir ?? getAuditKeysDir();
  await mkdir(keysDir, { recursive: true });

  const keyPath = await locatePrivate(keysDir);
  const signer = await LedgerSigner.load(keyPath);
  const keyId = await signer.getKeyId();

  const checkpointBody: Omit<AuditCheckpoint, "signature"> = {
    version: "kirakira.audit.checkpoint.v1",
    segment: summary.segment,
    first_event_id: summary.firstEventId,
    last_event_id: summary.lastEventId,
    entries: summary.entries,
    root_hash: summary.rootHash,
    signed_at: new Date().toISOString(),
    signer: { type: "ed25519", key_id: keyId },
  };

  const signature = await signer.sign(canonicalCheckpointSigningBytes(checkpointBody));
  const full: AuditCheckpoint = { ...checkpointBody, signature };

  const chkDir = getAuditCheckpointDir();
  await mkdir(chkDir, { recursive: true });
  const outfile = join(chkDir, `${segment}.${Date.now()}.json`);
  await writeFile(outfile, `${JSON.stringify(full, null, 2)}\n`, "utf8");

  console.log(outfile);
  return outfile;
}

export default class AuditCheckpointSignCmd extends Command {
  static override description =
    "Hash-wrap the contiguous tail shard of JSONL hashes and persist signed checkpoint envelopes";

  static override flags = {
    segment: Flags.string({ description: "YYYY-MM-DD-#### segment shard override" }),
    keys: Flags.string({ description: "Directory containing *.ed25519.priv.hex" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditCheckpointSignCmd);
    await auditCheckpointSign({
      segment: flags.segment,
      keysDir: flags.keys,
    });
  }
}
