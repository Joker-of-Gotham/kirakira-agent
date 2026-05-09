import { useState, useCallback, useEffect } from "react";
import {
  LedgerReader,
  LedgerVerifier,
  getAuditLedgerDir,
  getAuditCheckpointDir,
  getAuditKeysDir,
} from "@kirakira/audit-ledger";

import type { AuditCheckpoint } from "@kirakira/core";
import { auditCheckpointSchema } from "@kirakira/core/schemas/audit";

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type AuditChainStatus = "pending" | "OK" | "ERROR" | "EMPTY";

export interface AuditVerifyHookState {
  loading: boolean;
  error: string | null;
  segmentId?: string;
  entryCount?: number;
  chainStatus: AuditChainStatus;
  checkpointSigner?: string;
  checkpointSignedAt?: string;
  checkpointSignatureValid?: boolean;
  remoteAnchorStatus: string;
  refetch: () => Promise<void>;
}

async function pickVerifyPublicKey(keysDir: string): Promise<string | undefined> {
  let names: string[] = [];
  try {
    names = await readdir(keysDir);
  } catch {
    return undefined;
  }
  const pub = names.find((n) => n.endsWith(".ed25519.pub.hex"));
  return pub ? join(keysDir, pub) : undefined;
}

async function readLatestCheckpoint(
  cpDir: string,
): Promise<AuditCheckpoint | undefined> {
  let files: Array<{ path: string; mtimeMs: number }> = [];
  try {
    for (const n of await readdir(cpDir)) {
      if (!n.endsWith(".json")) continue;
      const path = join(cpDir, n);
      try {
        const st = await stat(path);
        files.push({ path, mtimeMs: st.mtimeMs });
      } catch {
        /* skip */
      }
    }
  } catch {
    return undefined;
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const f of files) {
    try {
      const raw = JSON.parse(await readFile(f.path, "utf8")) as unknown;
      const parsed = auditCheckpointSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      /* try next file */
    }
  }
  return undefined;
}

/**
 * Lightweight audit-chain snapshot for Ink (latest segment prev/hash verify + checkpoint signature when keys exist).
 */
export function useAuditVerify(options: {
  segmentId?: string;
  pollMs?: number;
} = {}): AuditVerifyHookState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState<string | undefined>();
  const [entryCount, setEntryCount] = useState<number | undefined>();
  const [chainStatus, setChainStatus] =
    useState<AuditChainStatus>("pending");
  const [checkpointSigner, setCheckpointSigner] = useState<
    string | undefined
  >();
  const [checkpointSignedAt, setCheckpointSignedAt] = useState<
    string | undefined
  >();
  const [checkpointSignatureValid, setCheckpointSignatureValid] =
    useState<boolean | undefined>();
  const [remoteAnchorStatus, setRemoteAnchorStatus] =
    useState<string>("No remote anchoring probe (baseline)");

  const verify = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const ledgerDir = getAuditLedgerDir();
      const reader = new LedgerReader(ledgerDir);

      let seg =
        options.segmentId ??
        (await reader.listSegmentIdsSorted()).at(-1) ??
        "";

      setSegmentId(seg || undefined);

      if (!seg) {
        setEntryCount(undefined);
        setChainStatus("EMPTY");
        setCheckpointSigner(undefined);
        setCheckpointSignedAt(undefined);
        setCheckpointSignatureValid(undefined);
        setRemoteAnchorStatus("No ledger segments yet");
        setLoading(false);
        return;
      }

      const res = await reader.verifySegmentChain(seg);
      setEntryCount(res.entries);
      if (res.entries === 0) {
        setChainStatus("EMPTY");
      } else {
        setChainStatus(res.valid ? "OK" : "ERROR");
      }

      const cp = await readLatestCheckpoint(getAuditCheckpointDir());
      if (!cp) {
        setCheckpointSigner(undefined);
        setCheckpointSignedAt(undefined);
        setCheckpointSignatureValid(undefined);
      } else {
        setCheckpointSigner(`${cp.signer.type}:${cp.signer.key_id}`);
        setCheckpointSignedAt(cp.signed_at);

        const pubPath = await pickVerifyPublicKey(getAuditKeysDir());
        if (!pubPath) {
          setCheckpointSignatureValid(undefined);
        } else {
          const verifier = new LedgerVerifier(pubPath);
          setCheckpointSignatureValid(await verifier.verifyCheckpoint(cp));
        }
      }

      // Check for existing remote anchors
      const anchorsDir = join(process.env.HOME || "~", ".kirakira", "audit", "anchors");
      try {
        const anchorFiles = await readdir(anchorsDir);
        const relevantAnchors = anchorFiles.filter(
          (f) => f.endsWith(".json") && f.includes(seg),
        );
        if (relevantAnchors.length > 0) {
          setRemoteAnchorStatus(
            `Anchored locally (${relevantAnchors.length} anchor file${relevantAnchors.length > 1 ? "s" : ""})`,
          );
        } else {
          setRemoteAnchorStatus(
            "No remote anchor found for this segment. Run: kirakira audit checkpoint sign && anchor",
          );
        }
      } catch {
        setRemoteAnchorStatus(
          "No anchors directory. Run: kirakira audit checkpoint sign",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setChainStatus("ERROR");
    } finally {
      setLoading(false);
    }
  }, [options.segmentId]);

  useEffect(() => {
    void verify();
    if (!options.pollMs || options.pollMs <= 0) return;
    const t = setInterval(() => {
      void verify();
    }, options.pollMs);
    return (): void => {
      clearInterval(t);
    };
  }, [verify, options.pollMs]);

  return {
    loading,
    error,
    segmentId,
    entryCount,
    chainStatus,
    checkpointSigner,
    checkpointSignedAt,
    checkpointSignatureValid,
    remoteAnchorStatus,
    refetch: verify,
  };
}
