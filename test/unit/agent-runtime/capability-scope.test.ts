import { describe, expect, it } from "vitest";
import { BudgetTracker } from "../../../packages/agent-runtime/src/context/budget-tracker.js";
import { ContextAssembler } from "../../../packages/agent-runtime/src/context/assembler.js";
import { HistoryCompressor } from "../../../packages/agent-runtime/src/context/history-compressor.js";
import { SkillInjector } from "../../../packages/agent-runtime/src/context/skill-injector.js";
import { ToolSearchEngine } from "../../../packages/agent-runtime/src/context/tool-search.js";
import { ToolRegistry } from "../../../packages/agent-runtime/src/tools/tool-registry.js";
import type { ReactWorkerState } from "../../../packages/agent-runtime/src/index.js";

function stateWithScope(
  scope: Partial<Pick<ReactWorkerState["config"], "toolScope" | "skillScope" | "mcpServers">>,
): ReactWorkerState {
  return {
    config: {
      id: "worker-1",
      runId: "run-1",
      workloadType: "supervisor",
      model: "test-model",
      systemPrompt: "system",
      contextBudget: {
        maxTokens: 4096,
        reservedForOutput: 512,
        toolSchemaAllocation: 1024,
        skillHintAllocation: 512,
        historyAllocation: 2048,
      },
      maxTurns: 4,
      ...scope,
    },
    turns: [],
    currentTurnSeq: 0,
    totalTokensUsed: 0,
    totalCostUsd: 0,
    status: "running",
    artifacts: [],
  };
}

function assembler(): ContextAssembler {
  const registry = new ToolRegistry();
  registry.register({
    name: "repo.read",
    description: "repo read available tools",
    inputSchema: { type: "object" },
  });
  registry.register({
    name: "web.search",
    description: "web search available tools",
    inputSchema: { type: "object" },
  });
  registry.register({
    name: "filesystem:read_file",
    description: "filesystem read available tools",
    inputSchema: { type: "object" },
  });
  const budget = new BudgetTracker();
  return new ContextAssembler(
    new ToolSearchEngine(),
    new SkillInjector([
      {
        name: "research",
        description: "research skill",
        version: "1.0.0",
        path: "unused",
      },
      {
        name: "review",
        description: "review skill",
        version: "1.0.0",
        path: "unused",
      },
    ]),
    new HistoryCompressor(budget),
    budget,
    registry,
    { toolCapabilityQuery: "available tools" },
  );
}

describe("runtime capability scope", () => {
  it("filters tools and skills during context assembly, even after an unscoped parent assembly", async () => {
    const ctx = assembler();
    const unscoped = await ctx.assemble(stateWithScope({}));
    expect(unscoped.toolSchemas.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["repo.read", "web.search"]),
    );

    const scoped = await ctx.assemble(
      stateWithScope({
        toolScope: ["repo.read"],
        skillScope: ["research"],
        mcpServers: [],
      }),
    );

    expect(scoped.toolSchemas.map((tool) => tool.name)).toEqual(["repo.read"]);
    expect(scoped.skillHints.map((skill) => skill.name)).toEqual(["research"]);
    expect(scoped.systemPrompt).toContain("research skill");
    expect(scoped.systemPrompt).not.toContain("review skill");
    expect(scoped.systemPrompt).not.toContain("web search available tools");
    expect(scoped.systemPrompt).not.toContain("filesystem read available tools");
  });
});
