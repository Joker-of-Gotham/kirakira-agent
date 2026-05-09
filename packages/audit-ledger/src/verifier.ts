import { createHash as cryptoCreateHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AuditCheckpoint } from "@kirakira/core";
import * as ed from "@noble/ed25519";
import { canonicalJson } from "./canonical-json.js";

if (!ed.etc.sha512Sync) {
  ed.etc.sha512Sync = (...m: Uint8Array[]) => {
    const h = cryptoCreateHash("sha512");
    for (const part of m) {
      h.update(part);
    }
    return new Uint8Array(h.digest());
  };
}

export type CheckpointSigningPayload = Omit<AuditCheckpoint, "signature">;

function canonicalCheckpointSigningBytes(cp: CheckpointSigningPayload): Uint8Array {
  return Buffer.from(canonicalJson(cp), "utf8");
}

async function decodePublicHex(path: string): Promise<Uint8Array> {
  const txt = (await readFile(path, "utf8")).trim().replace(/\s+/g, "");
  if (!/^[0-9a-f]{64}$/iu.test(txt)) {
    throw new Error(
      `Public key at ${path} must be hex-encoded Ed25519 32-byte compressed point`,
    );
  }
  return Uint8Array.from(Buffer.from(txt, "hex"));
}

export class LedgerVerifier {
  private readonly publicKeyLazy: Promise<Uint8Array>;

  constructor(public readonly publicKeyPath: string) {
    this.publicKeyLazy = decodePublicHex(publicKeyPath);
  }

  async verifySignature(data: Uint8Array, signatureBase64: string): Promise<boolean> {
    try {
      const sigBytes = Buffer.from(signatureBase64, "base64");
      if (sigBytes.length !== 64) {
        return false;
      }
      const pubKey = await this.publicKeyLazy;
      return await ed.verify(
        Uint8Array.from(sigBytes),
        data,
        pubKey,
      );
    } catch {
      return false;
    }
  }

  async verifyCheckpoint(checkpoint: AuditCheckpoint): Promise<boolean> {
    const { signature, ...rest } = checkpoint;
    const payload = canonicalCheckpointSigningBytes(rest);
    return await this.verifySignature(payload, signature);
  }
}

export { canonicalCheckpointSigningBytes };
