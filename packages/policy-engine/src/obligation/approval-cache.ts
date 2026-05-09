import type { ApprovalRecord, ApprovalScope } from "@kirakira/core";

import type { FingerprintResult } from "../fingerprint/fingerprint.js";

interface CacheEntry {
  record: ApprovalRecord;
  expiresAtMs: number;
}

/** In-memory approvals keyed by template fingerprint with optional TTL. */
export class ApprovalCache {
  private readonly entries = new Map<string, CacheEntry>();

  set(templateFingerprint: string, record: ApprovalRecord): void {
    this.entries.set(templateFingerprint, {
      record,
      expiresAtMs: Number.POSITIVE_INFINITY,
    });
  }

  get(templateFingerprint: string): ApprovalRecord | undefined {
    const e = this.entries.get(templateFingerprint);
    if (!e) return undefined;
    if (e.expiresAtMs !== Number.POSITIVE_INFINITY && Date.now() > e.expiresAtMs) {
      this.entries.delete(templateFingerprint);
      return undefined;
    }
    return e.record;
  }

  isApproved(fingerprint: FingerprintResult, scope: ApprovalScope): boolean {
    const e = this.entries.get(fingerprint.template);
    if (!e) return false;
    if (e.expiresAtMs !== Number.POSITIVE_INFINITY && Date.now() > e.expiresAtMs) {
      this.entries.delete(fingerprint.template);
      return false;
    }
    return e.record.scope === scope && e.record.status === "approved";
  }

  clear(): void {
    this.entries.clear();
  }

  pruneExpired(): number {
    const now = Date.now();
    let n = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAtMs !== Number.POSITIVE_INFINITY && now > entry.expiresAtMs) {
        this.entries.delete(key);
        n++;
      }
    }
    return n;
  }
}
