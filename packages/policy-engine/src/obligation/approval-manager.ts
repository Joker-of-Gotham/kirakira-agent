import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ApprovalRecord, ApprovalScope } from "@kirakira/core";

import type { FingerprintResult } from "../fingerprint/fingerprint.js";

/** Canonical on-disk approvals store (`~/.kirakira/approvals/`). */
export function defaultApprovalsDirectory(): string {
  return join(homedir(), ".kirakira", "approvals");
}

export interface ApprovalRequest {
  decisionId: string;
  fingerprint: FingerprintResult;
  title: string;
  risk: string;
  permissions: string[];
  interactive: boolean;
  /** Prefer passing the acting principal ID; omitted records use `"unknown"`. */
  userId?: string;
}

async function readRecord(path: string): Promise<ApprovalRecord | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ApprovalRecord;
  } catch {
    return undefined;
  }
}

async function findRecord(storePath: string, approvalId: string): Promise<{ path: string; record: ApprovalRecord } | undefined> {
  const directPath = join(storePath, `${approvalId}.json`);
  const hit = await readRecord(directPath);
  if (hit) return { path: directPath, record: hit };

  const names = await readdir(storePath);
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(storePath, name);
    const record = await readRecord(path);
    if (record?.approval_id === approvalId) return { path, record };
  }
  return undefined;
}

export class ApprovalManager {
  private readonly cache = new Map<string, ApprovalRecord>();

  readonly storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalRecord> {
    await mkdir(this.storePath, { recursive: true });
    const approval_id = randomUUID();
    const now = new Date().toISOString();
    const record: ApprovalRecord = {
      version: "kirakira.approval.v1",
      approval_id,
      status: "pending",
      scope: "once",
      requested_at: now,
      principal: {
        user_id: request.userId ?? "unknown",
        interactive: request.interactive,
      },
      decision_id: request.decisionId,
      fingerprint: { ...request.fingerprint },
      request_summary: {
        title: request.title,
        risk: request.risk,
        requested_permissions: request.permissions,
      },
    };

    const path = join(this.storePath, `${approval_id}.json`);
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    this.cache.set(request.fingerprint.template, record);
    return record;
  }

  async resolveApproval(
    approvalId: string,
    outcome: "approved" | "denied",
    scope: ApprovalScope,
    comment?: string,
  ): Promise<ApprovalRecord> {
    await mkdir(this.storePath, { recursive: true });
    const found = await findRecord(this.storePath, approvalId);
    if (!found) throw new Error(`approval not found: ${approvalId}`);

    const { path, record } = found;
    const updated: ApprovalRecord = {
      ...record,
      status: outcome === "approved" ? "approved" : "denied",
      scope,
      resolved_at: new Date().toISOString(),
      resolution: {
        outcome,
        ...(comment !== undefined ? { comment } : {}),
      },
    };

    await writeFile(path, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    this.cache.set(updated.fingerprint.template, updated);
    return updated;
  }

  checkCache(fingerprint: FingerprintResult, scope: ApprovalScope): ApprovalRecord | undefined {
    const fromMem = this.cache.get(fingerprint.template);
    if (fromMem && fromMem.scope === scope && fromMem.status === "approved") return fromMem;
    return undefined;
  }

  async revokeByFingerprint(templateFingerprint: string): Promise<void> {
    await mkdir(this.storePath, { recursive: true });
    try {
      const names = await readdir(this.storePath);
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const p = join(this.storePath, name);
        const r = await readRecord(p);
        if (r?.fingerprint.template === templateFingerprint) await unlink(p);
      }
    } finally {
      this.cache.delete(templateFingerprint);
    }
  }

  async pruneExpired(): Promise<number> {
    await mkdir(this.storePath, { recursive: true });
    let updated = 0;
    const names = await readdir(this.storePath);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const path = join(this.storePath, name);
      const r = await readRecord(path);
      if (!r || r.status !== "pending" || !r.requested_at) continue;
      const ageMs = Date.now() - Date.parse(r.requested_at);
      if (!Number.isFinite(ageMs) || ageMs < 14 * 86400 * 1000) continue;
      const next: ApprovalRecord = {
        ...r,
        status: "expired",
        resolved_at: new Date().toISOString(),
      };
      await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      updated++;
    }
    return updated;
  }

  async listPending(): Promise<ApprovalRecord[]> {
    await mkdir(this.storePath, { recursive: true });
    const out: ApprovalRecord[] = [];
    const names = await readdir(this.storePath);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const path = join(this.storePath, name);
      const r = await readRecord(path);
      if (r?.status === "pending") out.push(r);
    }
    return out;
  }

  async listAll(): Promise<ApprovalRecord[]> {
    await mkdir(this.storePath, { recursive: true });
    const out: ApprovalRecord[] = [];
    const names = await readdir(this.storePath);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const r = await readRecord(join(this.storePath, name));
      if (r) out.push(r);
    }
    return out.sort((a, b) => `${a.requested_at}`.localeCompare(`${b.requested_at}`));
  }
}
