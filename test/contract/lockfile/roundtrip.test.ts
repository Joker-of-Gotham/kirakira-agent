import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readLockFile,
  writeLockFile,
  type LockFile,
} from "@kirakira/core";

describe("lockfile YAML roundtrip", () => {
  it("byte-identical after write and read for fixed payload", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "kirakira-lock-rt-"));
    const lockPath = path.join(base, "kirakira.lock");
    const fixed: LockFile = {
      schemaVersion: 1,
      workspace: "roundtrip-ws",
      generatedAt: "2026-05-04T15:00:00.000Z",
      packages: [
        {
          kind: "skill",
          name: "pkg-a",
          version: "1.0.0",
          source: "reg",
          digest: "sha256:" + "b".repeat(64),
          trust: "ask",
        },
      ],
    };
    try {
      await writeLockFile(lockPath, fixed);
      const text = await readFile(lockPath, "utf-8");
      const again = await readLockFile(lockPath);
      await writeLockFile(lockPath, again);
      const text2 = await readFile(lockPath, "utf-8");
      expect(text2).toBe(text);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
