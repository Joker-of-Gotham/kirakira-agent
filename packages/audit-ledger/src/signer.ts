import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash as cryptoCreateHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import * as ed from "@noble/ed25519";
import { createHash } from "blake3";

if (!ed.etc.sha512Sync) {
  ed.etc.sha512Sync = (...m: Uint8Array[]) => {
    const h = cryptoCreateHash("sha512");
    for (const part of m) {
      h.update(part);
    }
    return new Uint8Array(h.digest());
  };
}

async function fingerprintKeyId(pub32: Uint8Array): Promise<string> {
  const hex = Buffer.from(pub32).toString("hex");
  const fh = createHash().update(Buffer.from(hex, "utf8")).digest("hex");
  return `kid_${fh.slice(0, 16)}`;
}

export class LedgerSigner {
  private readonly secretSeed: Uint8Array;
  private readonly publicKey: Uint8Array;

  readonly privateKeyPath: string;
  private keyIdMemo?: string;

  private constructor(
    seed: Uint8Array,
    publicKey: Uint8Array,
    pkPath: string,
  ) {
    this.secretSeed = seed;
    this.publicKey = publicKey;
    this.privateKeyPath = pkPath;
  }

  /** Load hexadecimal 64-char (32-byte) Ed25519 seed from disk. */
  static async load(privateKeyPath: string): Promise<LedgerSigner> {
    const rawTxt = await readFile(privateKeyPath, "utf8");
    const hex = rawTxt.trim().replace(/\s+/g, "");
    if (!/^([0-9a-f]{64})$/iu.test(hex)) {
      throw new Error(
        "Ledger private key file must contain a 64-hex-character (32-byte) Ed25519 seed",
      );
    }
    const secret = Uint8Array.from(Buffer.from(hex, "hex"));
    if (secret.length !== 32) {
      throw new Error(
        `Decoded Ed25519 seed must decode to 32 octets (${secret.length} received)`,
      );
    }
    const pubkey = await ed.getPublicKey(secret);
    return new LedgerSigner(secret, pubkey, privateKeyPath);
  }

  static create = LedgerSigner.load;

  async sign(message: Uint8Array): Promise<string> {
    const sigBytes = await ed.sign(message, this.secretSeed);
    return Buffer.from(sigBytes).toString("base64");
  }

  async getKeyId(): Promise<string> {
    if (!this.keyIdMemo) {
      this.keyIdMemo = await fingerprintKeyId(this.publicKey);
    }
    return this.keyIdMemo;
  }

  static async generateKeyPair(keysDir: string): Promise<{
    publicKeyPath: string;
    privateKeyPath: string;
    keyId: string;
  }> {
    await mkdir(keysDir, { recursive: true });
    const seed = new Uint8Array(randomBytes(32));
    const publicKeyBytes = await ed.getPublicKey(seed);
    const keyId = await fingerprintKeyId(publicKeyBytes);
    const privateKeyPath = join(keysDir, `${keyId}.ed25519.priv.hex`);
    const publicKeyPath = join(keysDir, `${keyId}.ed25519.pub.hex`);

    await writeFile(
      privateKeyPath,
      `${Buffer.from(seed).toString("hex")}\n`,
      "utf8",
    );
    await writeFile(
      publicKeyPath,
      `${Buffer.from(publicKeyBytes).toString("hex")}\n`,
      "utf8",
    );

    return { privateKeyPath, publicKeyPath, keyId };
  }
}
