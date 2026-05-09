import type { ModelPlannerClient } from "@kirakira/agent-runtime";
import type { MergeResult, MergeStrategy, SourceAttribution, TaskResult } from "../types.js";

function scoreForSelectBest(output: unknown): number {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return Number.NEGATIVE_INFINITY;
  }
  const raw = (output as { score?: unknown }).score;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return Number.NEGATIVE_INFINITY;
  }
  return raw;
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export class MergeEngine {
  constructor(private readonly modelClient?: ModelPlannerClient) {}

  async merge(results: TaskResult[], strategy: MergeStrategy): Promise<MergeResult> {
    const sources: SourceAttribution[] = results.map((r, index) => ({
      index,
      summary: r.output,
      ...(r.artifactRefs?.length ? { artifactRefs: r.artifactRefs } : {}),
    }));

    switch (strategy) {
      case "concatenate":
        return {
          output: results.map((r) => r.output),
          sources,
          strategy,
        };
      case "summarize": {
        if (this.modelClient) {
          const user = JSON.stringify(
            results.map((r, i) => ({
              index: i,
              output: r.output,
              artifactRefs: r.artifactRefs ?? [],
            })),
            null,
            2,
          );
          const raw = await this.modelClient.completeText({
            system:
              'Consolidate the task outputs into one concise summary. Respond with ONLY valid JSON: {"summary": string} where summary is your synthesized result.',
            user,
          });
          let output: unknown;
          try {
            const parsed = JSON.parse(stripCodeFences(raw)) as { summary?: unknown };
            output = parsed.summary ?? raw;
          } catch {
            output = stripCodeFences(raw);
          }
          return { output, sources, strategy };
        }
        return {
          output: {
            kind: "concatenated_summary",
            parts: results.map((r, i) => ({
              index: i,
              content: typeof r.output === "string" ? r.output : JSON.stringify(r.output),
              artifactRefs: r.artifactRefs ?? [],
            })),
          },
          sources,
          strategy,
        };
      }
      case "select_best": {
        let best = results[0];
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const r of results) {
          const s = scoreForSelectBest(r.output);
          if (s > bestScore) {
            bestScore = s;
            best = r;
          }
        }
        return {
          output: best?.output,
          sources,
          strategy,
        };
      }
      case "structured_combine":
        return {
          output: {
            artifacts: [...new Set(results.flatMap((r) => r.artifactRefs ?? []))],
            bodies: results.map((r) => r.output),
          },
          sources,
          strategy,
        };
    }
  }
}
