import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";
import type { ReactWorkerConfig } from "../../../packages/agent-runtime/src/index.js";
import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
import { KernelBridge } from "../../../packages/runtime-daemon/src/bridge/kernel-bridge.js";
import {
  createDaemonDelegateRuntime,
  type DaemonDelegateRuntimeOptions,
} from "../../../packages/runtime-daemon/src/bridge/runtime-deps.js";

function parentConfig(runId = "run-1"): ReactWorkerConfig {
  return {
    id: "worker-parent",
    runId,
    workloadType: "supervisor",
    model: "test-model",
    systemPrompt: "system",
    contextBudget: {
      maxTokens: 4096,
      reservedForOutput: 512,
      toolSchemaAllocation: 512,
      skillHintAllocation: 512,
      historyAllocation: 2048,
    },
    maxTurns: 4,
  };
}

function waitForBridgeEvent(
  bridge: KernelBridge,
  predicate: (event: RunEvent) => boolean,
): Promise<RunEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for bridge event"));
    }, 2_000);
    const unsubscribe = bridge.onEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

describe("runtime daemon subagent bridge", () => {
  it("creates an EphemeralWorker delegate runner from daemon runtime deps", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-daemon-runtime-"));
    const emitted: RunEvent[] = [];
    const runtime = await createDaemonDelegateRuntime({
      workspaceRoot,
      eventWriter: {
        async emit(event) {
          emitted.push(event);
        },
      },
      modelGateway: {
        async complete() {
          return {
            text: JSON.stringify({
              kind: "final_output",
              output: "daemon child result",
            }),
            model: "test-model",
          };
        },
      },
    });

    try {
      const result = await runtime.delegateRunner({
        subagentId: "sg-1",
        parentWorkerId: "worker-parent",
        parentConfig: parentConfig(),
        runId: "run-1",
        task: "inspect daemon runtime",
        capabilities: [{ kind: "tool", name: "repo.read" }],
        action: {
          kind: "delegate",
          args: { task: "inspect daemon runtime" },
        },
      });

      expect(result).toMatchObject({
        success: true,
        finalText: "daemon child result",
      });
      expect(emitted.map((event) => event.kind)).toEqual(
        expect.arrayContaining(["run.started", "model.request", "run.completed"]),
      );
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("installs the daemon delegate runtime bridge into KernelBridge by default", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-kernel-bridge-"));
    const eventStorePath = join(workspaceRoot, "events");
    const seen: RunEvent[] = [];
    let factoryOptions: DaemonDelegateRuntimeOptions | undefined;
    let closed = false;
    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      kernelOptions: {
        planContext: {
          workspace: workspaceRoot,
          availableTools: ["repo.read"],
          availableSkills: [],
          availableMcpServers: [],
        },
        planner: {
          async completeText() {
            return JSON.stringify({
              goal: "Inspect repo",
              steps: [
                {
                  id: "inspect",
                  description: "Inspect repository architecture",
                  kind: "subagent",
                  dependsOn: [],
                  canParallelize: true,
                  toolScope: ["repo.read"],
                  subagent: { taskBrief: "Inspect repository architecture" },
                },
              ],
              estimatedComplexity: "complex",
              requiresSubagents: true,
            });
          },
        },
      },
      async delegateRuntimeFactory(options) {
        factoryOptions = options;
        return {
          async close() {
            closed = true;
          },
          async delegateRunner(request) {
            await options.eventWriter.emit({
              id: "delegate-event",
              runId: request.runId,
              timestamp: new Date(0).toISOString(),
              kind: "model.response",
              payload: {
                workerId: request.subagentId,
                source: "delegate-runtime",
              },
            });
            expect(request).toMatchObject({
              parentTaskId: "inspect",
              task: "Inspect repository architecture",
              capabilities: [{ kind: "tool", name: "repo.read" }],
            });
            return {
              success: true,
              workerId: "worker-child",
              finalText: "child summary",
            };
          },
        };
      },
    });

    try {
      await bridge.create();
      const unsubscribe = bridge.onEvent((event) => {
        seen.push(event);
      });
      const completed = waitForBridgeEvent(
        bridge,
        (event) => event.kind === "run.completed",
      );

      await bridge.submitRun("Inspect repo", "headless", { workspaceRoot });
      await completed;
      unsubscribe();

      expect(factoryOptions?.workspaceRoot).toBe(workspaceRoot);
      expect(seen).toContainEqual(
        expect.objectContaining({
          kind: "model.response",
          payload: expect.objectContaining({ source: "delegate-runtime" }),
        }),
      );
      expect(seen).toContainEqual(
        expect.objectContaining({
          kind: "subagent.completed",
          payload: expect.objectContaining({
            subagentId: "inspect",
            status: "completed",
            preview: "child summary",
          }),
        }),
      );
    } finally {
      await bridge.destroy();
      await rm(workspaceRoot, { recursive: true, force: true });
    }

    expect(closed).toBe(true);
  });
});
