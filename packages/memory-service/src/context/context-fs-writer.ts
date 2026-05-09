import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ContextBundle, ContextL2Card } from "@kirakira/memory-core";

/**
 * Materializes a ContextBundle to the filesystem structure specified in the design doc:
 *
 *   /context/
 *     recall/
 *       bundle.json
 *       L0.abstract.md
 *       L1.overview.md
 *       L2.cards/
 *         0001.fact.md
 *         0002.observation.md
 *       L3.evidence/
 *         ev_01.json
 *         art_02.pointer.json
 *
 * This enables external tooling, debugging, and audit inspection of recall outputs.
 */
export class ContextFsWriter {
  constructor(private readonly baseDir: string) {}

  async write(bundle: ContextBundle, subDir = "recall"): Promise<string> {
    const dir = join(this.baseDir, subDir);
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, "bundle.json"), JSON.stringify(bundle, null, 2));

    const l0 = bundle.levels.l0;
    const l0Md = [
      `# Recall Abstract`,
      "",
      l0.abstract,
      "",
      `- **Entities:** ${l0.entityCount}`,
      l0.timeWindow
        ? `- **Time window:** ${l0.timeWindow.from ?? "?"} → ${l0.timeWindow.to ?? "?"}`
        : "",
      `- **Estimated tokens:** ${l0.estimatedTokens}`,
    ]
      .filter(Boolean)
      .join("\n");
    await writeFile(join(dir, "L0.abstract.md"), l0Md);

    if (bundle.levels.l1) {
      const l1 = bundle.levels.l1;
      const l1Lines: string[] = ["# Recall Overview", ""];
      if (l1.factSummaries.length > 0) {
        l1Lines.push("## Facts", "");
        l1.factSummaries.forEach((f, i) => l1Lines.push(`${i + 1}. ${f}`));
        l1Lines.push("");
      }
      if (l1.observationSummaries.length > 0) {
        l1Lines.push("## Observations", "");
        l1.observationSummaries.forEach((o, i) => l1Lines.push(`${i + 1}. ${o}`));
        l1Lines.push("");
      }
      if (l1.stateSummary) {
        l1Lines.push("## State", "", l1.stateSummary, "");
      }
      l1Lines.push(`*Estimated tokens: ${l1.estimatedTokens}*`);
      await writeFile(join(dir, "L1.overview.md"), l1Lines.join("\n"));
    }

    if (bundle.levels.l2 && bundle.levels.l2.cards.length > 0) {
      const cardsDir = join(dir, "L2.cards");
      await mkdir(cardsDir, { recursive: true });
      for (let i = 0; i < bundle.levels.l2.cards.length; i++) {
        const card = bundle.levels.l2.cards[i]!;
        const idx = String(i + 1).padStart(4, "0");
        const filename = `${idx}.${card.kind}.md`;
        await writeFile(join(cardsDir, filename), formatCard(card));
      }
    }

    if (bundle.levels.l3 && bundle.levels.l3.evidence.length > 0) {
      const evDir = join(dir, "L3.evidence");
      await mkdir(evDir, { recursive: true });
      for (let i = 0; i < bundle.levels.l3.evidence.length; i++) {
        const ev = bundle.levels.l3.evidence[i]!;
        const idx = String(i + 1).padStart(2, "0");
        const filename = ev.artifactPointer
          ? `art_${idx}.pointer.json`
          : `ev_${idx}.json`;
        await writeFile(join(evDir, filename), JSON.stringify(ev, null, 2));
      }
    }

    return dir;
  }
}

function formatCard(card: ContextL2Card): string {
  return [
    `# ${card.kind} — ${card.id}`,
    "",
    card.summary,
    "",
    `- **Provenance:** ${card.provenance}`,
    `- **Route reason:** ${card.routeReason}`,
    `- **Score:** ${card.score.toFixed(4)}`,
  ].join("\n");
}
