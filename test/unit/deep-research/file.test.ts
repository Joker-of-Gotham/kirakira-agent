import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { fileProviderFromWorkspace } from "../../../packages/deep-research/src/index.js";

async function workspaceFixture(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-file-research-"));
  await mkdir(join(workspaceRoot, "docs"), { recursive: true });
  await mkdir(join(workspaceRoot, "src"), { recursive: true });
  await mkdir(join(workspaceRoot, "node_modules", "ignored"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "docs", "architecture.md"),
    [
      "# Architecture",
      "Daemon memory gateway evidence should be cited from workspace files.",
      "Subagent swarm design stays separate from transport details.",
    ].join("\n"),
  );
  await writeFile(
    join(workspaceRoot, "src", "notes.txt"),
    "Runtime profile composition mentions daemon memory gateway readiness.",
  );
  await writeFile(
    join(workspaceRoot, "node_modules", "ignored", "architecture.md"),
    "Daemon memory gateway text from ignored dependencies must not appear.",
  );
  await writeFile(join(workspaceRoot, "binary.bin"), Buffer.from([0, 1, 2, 3, 4]));
  return workspaceRoot;
}

describe("file research source adapter", () => {
  it("collects bounded file evidence from workspace text files", async () => {
    const workspaceRoot = await workspaceFixture();
    const adapter = fileProviderFromWorkspace({
      workspaceRoot,
      includeExtensions: [".md", ".txt"],
      maxEvidence: 4,
      retrievedAt: "2026-06-10T00:00:00.000Z",
    });

    try {
      const evidence = await adapter.search({
        taskId: "research-file",
        query: "daemon memory gateway",
        sourceKind: "file",
        limits: { maxDepth: 3, maxBreadth: 2, maxToolCalls: 4 },
        requireCitations: true,
      });

      expect(evidence.map((item) => item.title)).toEqual([
        "docs/architecture.md",
        "src/notes.txt",
      ]);
      expect(evidence).toHaveLength(2);
      expect(evidence[0]).toMatchObject({
        sourceKind: "file",
        query: "daemon memory gateway",
        citations: [
          expect.objectContaining({
            sourceKind: "file",
            uri: "workspace://docs/architecture.md",
            retrievedAt: "2026-06-10T00:00:00.000Z",
            sourceRecordId: "docs/architecture.md",
            artifactPointer: "docs/architecture.md#L2",
          }),
        ],
        metadata: expect.objectContaining({
          path: "docs/architecture.md",
          matchedTokens: ["daemon", "memory", "gateway"],
        }),
      });
      expect(JSON.stringify(evidence)).not.toContain("ignored dependencies");
      expect(JSON.stringify(evidence)).not.toContain("binary.bin");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("rejects file roots that escape the workspace", async () => {
    const workspaceRoot = await workspaceFixture();
    const adapter = fileProviderFromWorkspace({
      workspaceRoot,
      roots: ["../outside"],
    });

    await expect(
      adapter.search({
        taskId: "research-file",
        query: "daemon memory gateway",
        sourceKind: "file",
        limits: { maxDepth: 3, maxBreadth: 2, maxToolCalls: 4 },
        requireCitations: true,
      }),
    ).rejects.toThrow(/escapes workspace root/);

    await rm(workspaceRoot, { recursive: true, force: true });
  });
});
