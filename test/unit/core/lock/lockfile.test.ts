import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addPackageToLock,
  createEmptyLockFile,
  diffLockFiles,
  readLockFile,
  removePackageFromLock,
  writeLockFile,
  type LockFile,
} from "@kirakira/core";

function sampleEntry() {
  return {
    kind: "skill" as const,
    name: "demo-skill",
    version: "1.0.0",
    source: "registryx",
    digest: "sha256:" + "a".repeat(64),
    trust: "ask" as const,
  };
}

describe("lockfile helpers", () => {
  it("create, mutate, write, read, diff with real temp dir", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "kirakira-lock-"));
    const lockPath = path.join(base, "kirakira.lock");
    try {
      let lock: LockFile = createEmptyLockFile("ws-test");
      lock = addPackageToLock(lock, sampleEntry());
      lock = { ...lock, generatedAt: "2026-05-04T12:00:00.000Z" };

      await writeLockFile(lockPath, lock);
      const diskBefore = await readFile(lockPath, "utf-8");
      const roundtrip = await readLockFile(lockPath);
      expect(roundtrip.workspace).toBe("ws-test");
      expect(roundtrip.packages).toHaveLength(1);
      expect(roundtrip.packages[0]?.name).toBe("demo-skill");

      let lock2 = removePackageFromLock(roundtrip, "skill", "demo-skill");
      lock2 = { ...lock2, generatedAt: "2026-05-04T13:00:00.000Z" };
      await writeLockFile(lockPath, lock2);
      const diskAfter = await readFile(lockPath, "utf-8");
      expect(diskAfter).not.toBe(diskBefore);

      const diff = diffLockFiles(lock, await readLockFile(lockPath));
      expect(diff.some((d) => d.action === "removed")).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("readLockFile throws for missing file", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "kirakira-lock-"));
    try {
      await expect(readLockFile(path.join(base, "missing.lock"))).rejects.toThrow(
        /not found/i,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
