import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunState } from "../../../packages/runtime-contracts/src/index.js";
import {
  RuntimeArtifactContentError,
  readRuntimeArtifactContent,
} from "../../../packages/runtime-daemon/src/server/artifact-content.js";

const runState = (workspaceRoot: string, artifactPath: string): RunState => ({
  runId: "run-1",
  status: "completed",
  workspaceRoot,
  taskNodes: {},
  taskEdges: [],
  artifacts: {
    "artifact-a": {
      id: "artifact-a",
      path: artifactPath,
      kind: "markdown",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:01.000Z",
    },
  },
  subagents: {},
  researchRuns: {},
  skills: {},
  tools: {},
  modelTranscript: [],
  sandboxOpen: false,
  approvals: {},
  interrupts: {},
  merges: {},
  control: { drainRequestedVersion: 0 },
  checkpoint: {},
  lastSeq: 1,
});

describe("runtime artifact content reader", () => {
  it("reads bounded text content for artifacts recorded inside the workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kirakira-artifact-"));
    try {
      await mkdir(path.join(root, "artifacts"));
      await writeFile(path.join(root, "artifacts", "report.md"), "0123456789abcdef");

      const content = await readRuntimeArtifactContent({
        state: runState(root, "artifacts/report.md"),
        artifactId: "artifact-a",
        fallbackWorkspaceRoot: root,
        maxBytes: 8,
      });

      expect(content).toMatchObject({
        runId: "run-1",
        artifactId: "artifact-a",
        path: "artifacts/report.md",
        encoding: "utf8",
        content: "01234567",
        truncated: true,
        sizeBytes: 16,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects artifact paths that resolve outside the workspace", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "kirakira-artifact-boundary-"));
    const root = path.join(parent, "workspace");
    try {
      await mkdir(root);
      await writeFile(path.join(parent, "secret.txt"), "secret");

      await expect(
        readRuntimeArtifactContent({
          state: runState(root, "../secret.txt"),
          artifactId: "artifact-a",
          fallbackWorkspaceRoot: root,
        }),
      ).rejects.toMatchObject<Partial<RuntimeArtifactContentError>>({
        code: "artifact_outside_workspace",
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
