import type {
  ArtifactRef,
  ContextAssemblerOptions,
  ContextBudget,
  Message,
  ReactWorkerState,
  ToolSchema,
  Turn,
  WorkingSet,
} from "../types.js";
import type { TokenUsage } from "../types.js";

import type { ToolSearchEngine } from "./tool-search.js";
import type { SkillInjector } from "./skill-injector.js";
import type { HistoryCompressor } from "./history-compressor.js";
import type { BudgetTracker } from "./budget-tracker.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ArtifactStore } from "../sandbox/artifact-store.js";

export type ContextAssemblerInitOptions = ContextAssemblerOptions & {
  artifactStore?: ArtifactStore;
};

function turnsToMessages(turns: Turn[]): Message[] {
  const msgs: Message[] = [];
  for (const t of turns) {
    if (t.action) {
      msgs.push({ role: "assistant", content: JSON.stringify({ step: t.action }) });
    }
    if (t.observation) {
      msgs.push({
        role: "tool",
        name: "environment",
        content: t.observation.content,
      });
    }
  }
  return msgs;
}

export class ContextAssembler {
  private readonly hydratedTools = new Set<string>();

  constructor(
    private readonly toolSearch: ToolSearchEngine,
    private readonly skillInjector: SkillInjector,
    private readonly historyCompressor: HistoryCompressor,
    private readonly budgetTracker: BudgetTracker,
    private readonly registry: ToolRegistry,
    private options: ContextAssemblerInitOptions = {},
  ) {}

  setTaskPreamble(preamble: string): void {
    this.options = { ...this.options, taskPreamble: preamble };
  }

  recordModelUsage(usage: TokenUsage): void {
    this.budgetTracker.recordActualUsage(usage);
  }

  async assemble(state: ReactWorkerState): Promise<WorkingSet> {
    const last = state.turns[state.turns.length - 1];
    if (last?.action?.kind === "tool_call" && last.action.toolName) {
      this.hydratedTools.add(last.action.toolName);
    }

    const budget = state.config.contextBudget;
    this.toolSearch.indexTools(this.registry.all());
    const toolQuery = this.options.toolCapabilityQuery ?? "available tools";
    const capability = this.toolSearch.capabilitySearch(toolQuery, budget.toolSchemaAllocation);
    const toolSchemas: ToolSchema[] = [];
    for (const preview of capability) {
      if (this.hydratedTools.has(preview.name)) {
        const full = this.registry.get(preview.name) ?? this.toolSearch.getFullSchema(preview.name);
        toolSchemas.push(full ?? preview);
      } else {
        toolSchemas.push(preview);
      }
    }

    const advertised = this.skillInjector.getAdvertised();
    const skillBlockAdvertised = this.skillInjector.getInjectionContent("advertised");
    const skillBlockLoaded = this.skillInjector.getInjectionContent("loaded");
    const skillBlockMaterialized = this.skillInjector.getInjectionContent("materialized");

    const baseMessages: Message[] = [];
    if (this.options.taskPreamble) {
      baseMessages.push({ role: "user", content: this.options.taskPreamble });
    }
    baseMessages.push(...turnsToMessages(state.turns));

    let historyBudget = budget.historyAllocation;
    if (this.historyCompressor.shouldCompress(state)) {
      historyBudget = Math.floor(historyBudget * 0.85);
    }
    const messages = await this.historyCompressor.compress(baseMessages, historyBudget);

    const systemPrompt = [
      state.config.systemPrompt,
      "## Skills",
      skillBlockAdvertised,
      ...(skillBlockLoaded.length > 0 ? ["### Loaded skill bodies", skillBlockLoaded] : []),
      ...(skillBlockMaterialized.length > 0
        ? ["### Materialized skills", skillBlockMaterialized]
        : []),
      "## Tools",
      ...toolSchemas.map((t) => `- ${t.name}: ${t.description}`),
    ].join("\n\n");

    const store = this.options.artifactStore;
    const artifactIndex: ArtifactRef[] = state.artifacts.map((id) => {
      const art = store?.get(id);
      if (art && store) {
        return store.ref(art);
      }
      return {
        id,
        name: id,
        mimeType: "application/octet-stream",
        size: 0,
        hash: "",
        createdAt: new Date().toISOString(),
      };
    });

    let total = this.budgetTracker.estimate(systemPrompt);
    for (const m of messages) total += this.budgetTracker.estimate(m.content);
    const workingSet: WorkingSet = {
      systemPrompt,
      messages,
      toolSchemas,
      skillHints: advertised,
      artifactIndex,
      totalTokenEstimate: total,
    };
    this.budgetTracker.track(workingSet);
    return workingSet;
  }

  remainingTokens(budget: ContextBudget): number {
    return this.budgetTracker.remaining(budget);
  }
}
