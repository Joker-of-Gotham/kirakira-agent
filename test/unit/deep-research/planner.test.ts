import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDeepResearchPlan,
  DeepResearchRunner,
  resolveDeepResearchOptions,
  type ResearchSourceAdapter,
} from "../../../packages/deep-research/src/index.js";

const workspaceRoot = resolve("tmp/deep-research-workspace");

describe("deep research options and planner", () => {
  it("normalizes config limits and keeps workspace artifacts inside the workspace", () => {
    const options = resolveDeepResearchOptions(
      {
        enabled: true,
        max_depth: 5.8,
        max_breadth: 2,
        max_tool_calls: 7,
        require_citations: false,
        source_policy: "web",
        workspace_dir: ".kirakira/research",
      },
      workspaceRoot,
    );

    expect(options.enabled).toBe(true);
    expect(options.limits).toEqual({
      maxDepth: 5,
      maxBreadth: 2,
      maxToolCalls: 7,
    });
    expect(options.requiredSourceKinds).toEqual(["web"]);
    expect(options.workspaceDir).toContain("deep-research-workspace");

    expect(() =>
      resolveDeepResearchOptions(
        { workspace_dir: "../outside" },
        workspaceRoot,
      ),
    ).toThrow(/inside workspace root/);
  });

  it("enforces workspace-only source policy without adding web access", () => {
    const options = resolveDeepResearchOptions(
      {
        enabled: true,
        source_policy: "workspace",
      },
      workspaceRoot,
    );
    const plan = createDeepResearchPlan("Inspect local project history", options);

    expect(plan.requiredSourceKinds).toEqual(["memory", "file"]);
    expect(plan.tasks[0]?.sourceKinds).toEqual(["memory", "file"]);
    expect(() =>
      createDeepResearchPlan(
        {
          prompt: "Inspect local project history",
          requiredSourceKinds: ["web"],
        },
        options,
      ),
    ).toThrow(/not allowed/);
  });

  it("forces citation verification for verified research", () => {
    const options = resolveDeepResearchOptions(
      {
        enabled: true,
        source_policy: "verified",
        require_citations: false,
      },
      workspaceRoot,
      { availableSourceKinds: ["memory", "web"] },
    );
    const plan = createDeepResearchPlan("Compare two claims", options);

    expect(options.requireCitations).toBe(true);
    expect(plan.citationSchema).toMatchObject({
      required: true,
      minCitationsPerFinding: 2,
      acceptedSourceKinds: ["memory", "web"],
    });
  });

  it("limits subquestion breadth and records omitted unknowns", () => {
    const options = resolveDeepResearchOptions(
      {
        enabled: true,
        max_depth: 3,
        max_breadth: 2,
        source_policy: "hybrid",
      },
      workspaceRoot,
      { availableSourceKinds: ["memory"] },
    );
    const plan = createDeepResearchPlan(
      {
        prompt: "Research architecture options",
        subquestions: ["A", "B", "C"],
      },
      options,
    );

    expect(plan.tasks.map((task) => task.kind)).toEqual([
      "research",
      "research",
      "synthesis",
    ]);
    expect(plan.unknowns).toContain("1 subquestions were omitted by max_breadth.");
  });
});

describe("DeepResearchRunner", () => {
  it("no-ops when disabled and does not call source adapters", async () => {
    let calls = 0;
    const adapter: ResearchSourceAdapter = {
      kind: "web",
      async search() {
        calls += 1;
        return [];
      },
    };
    const runner = new DeepResearchRunner({
      options: resolveDeepResearchOptions(
        { enabled: false, source_policy: "web" },
        workspaceRoot,
      ),
      sourceAdapters: [adapter],
    });

    const result = await runner.run("Should not run");

    expect(result.status).toBe("disabled");
    expect(result.plan.tasks).toEqual([]);
    expect(result.toolCalls).toBe(0);
    expect(calls).toBe(0);
  });

  it("collects evidence through injected source adapters", async () => {
    const adapter: ResearchSourceAdapter = {
      kind: "web",
      async search(request) {
        return [
          {
            id: "ev-web-1",
            sourceKind: "web",
            query: request.query,
            summary: "source summary",
            citations: [
              {
                id: "cite-web-1",
                sourceKind: "web",
                uri: "https://example.test/source",
              },
            ],
          },
        ];
      },
    };
    const runner = new DeepResearchRunner({
      options: resolveDeepResearchOptions(
        { enabled: true, source_policy: "web" },
        workspaceRoot,
      ),
      sourceAdapters: [adapter],
    });

    const result = await runner.run("Find current source-backed evidence");

    expect(result.status).toBe("evidence_collected");
    expect(result.toolCalls).toBe(1);
    expect(result.evidence[0]?.summary).toBe("source summary");
    expect(result.citations[0]?.uri).toBe("https://example.test/source");
  });
});
