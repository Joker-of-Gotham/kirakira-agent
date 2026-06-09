import type { Message, ReactWorkerState } from "../types.js";

import type { BudgetTracker } from "./budget-tracker.js";
import type { ModelClient } from "../model/model-client.js";

const MARKER_PREFIX = "[ctx:";
const DROP_MARKERS = true;

export class HistoryCompressor {
  constructor(
    private readonly budgetTracker: BudgetTracker,
    private readonly modelClient?: ModelClient,
  ) {}

  fork(budgetTracker: BudgetTracker): HistoryCompressor {
    return new HistoryCompressor(budgetTracker, this.modelClient);
  }

  shouldCompress(state: ReactWorkerState): boolean {
    const histBudget = state.config.contextBudget.historyAllocation;
    const turns = state.turns;
    let raw = 0;
    for (const t of turns) {
      if (t.observation?.content) {
        raw += this.budgetTracker.estimate(t.observation.content);
      }
      if (t.action) {
        raw += this.budgetTracker.estimate(JSON.stringify(t.action));
      }
    }
    return raw > histBudget;
  }

  async compress(messages: Message[], budget: number): Promise<Message[]> {
    const rawCost = messages.reduce((a, m) => a + this.budgetTracker.estimate(m.content) + 8, 0);
    const summarize =
      this.modelClient !== undefined && rawCost > Math.floor(budget * 1.5) && messages.length > 4;

    if (summarize) {
      const tail = messages.slice(-2);
      const head = messages.slice(0, -2);
      const toolChunks = head.filter((m) => m.role === "tool");
      const nonTool = head.filter((m) => m.role !== "tool");
      if (toolChunks.length >= 2) {
        const summary = await this.summarizeMessages(toolChunks);
        const merged = [...nonTool, summary, ...tail];
        return this.truncateToBudget(merged, budget);
      }
    }

    return this.truncateToBudget(messages, budget);
  }

  private async summarizeMessages(toolMessages: Message[]): Promise<Message> {
    const transcript = toolMessages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
    const res = await this.modelClient!.complete(
      [
        {
          role: "user",
          content: `Summarize the following tool results for downstream context. Preserve important paths, errors, numbers, and outcomes. Be concise.\n\n${transcript}`,
        },
      ],
      { model, temperature: 0.2, maxTokens: 1024 },
      undefined,
    );
    return { role: "user", content: `[summarized tool results]\n${res.text}` };
  }

  private truncateToBudget(messages: Message[], budget: number): Message[] {
    const out: Message[] = [];
    let used = 0;
    const rev = [...messages].reverse();
    const acc: Message[] = [];
    for (const m of rev) {
      let content = m.content;
      if (DROP_MARKERS && content.includes(MARKER_PREFIX)) {
        content = content.replace(/\[ctx:[^\]]+\]/g, "");
      }
      if (m.role === "tool" && content.length > 2000) {
        content = `${content.slice(0, 1800)}\n… [truncated ${content.length - 1800} chars]`;
      }
      const cost = this.budgetTracker.estimate(content) + 8;
      if (used + cost > budget && acc.length > 0) {
        break;
      }
      used += cost;
      acc.push({ ...m, content });
    }
    acc.reverse();
    out.push(...acc);
    if (out.length === 0 && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last) {
        const content =
          last.content.length > budget * 4
            ? `${last.content.slice(0, Math.max(0, budget * 4 - 32))}…`
            : last.content;
        out.push({ ...last, content });
      }
    }
    return out;
  }
}
