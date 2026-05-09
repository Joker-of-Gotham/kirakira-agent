import type { EpisodeSourceType } from "@kirakira/memory-core";
import type { MemoryKind } from "@kirakira/memory-core";

export interface ClassifiedMemoryEvent {
  sourceType: EpisodeSourceType;
  estimatedImportance: number;
  hasEntities: boolean;
  hasFacts: boolean;
  hasPreferences: boolean;
  suggestedMemoryKinds: MemoryKind[];
  /** Heuristic labels extracted from text (tokens in ALL CAPS, quoted phrases, @handles). */
  entityHints: string[];
}

const ENTITY_LIKE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g;
const QUOTED = /"([^"]{2,64})"|'([^']{2,64})'/g;
const HANDLE = /@[\w.-]+/g;

export class MemoryEventClassifier {
  classify(rawText: string, metadata?: Record<string, unknown>): ClassifiedMemoryEvent {
    const text = rawText.trim();
    const lower = text.toLowerCase();
    const metaSource = typeof metadata?.sourceType === "string" ? metadata.sourceType : undefined;

    let sourceType: EpisodeSourceType = "chat";
    if (metaSource === "tool" || metaSource === "file" || metaSource === "web" || metaSource === "sandbox") {
      sourceType = metaSource;
    } else if (/\b(ran|tool result|stdout|stderr)\b/i.test(text)) {
      sourceType = "tool";
    } else if (/\bhttps?:\/\//i.test(text)) {
      sourceType = "web";
    }

    const entityHints = new Set<string>();
    for (const m of text.matchAll(ENTITY_LIKE)) {
      entityHints.add(m[0]!);
    }
    let qm: RegExpExecArray | null;
    const qre = new RegExp(QUOTED);
    while ((qm = qre.exec(text)) !== null) {
      const g = qm[1] ?? qm[2];
      if (g) entityHints.add(g);
    }
    for (const m of text.matchAll(HANDLE)) {
      entityHints.add(m[0]!);
    }

    const hasEntities = entityHints.size > 0;
    const factSignals =
      /\b(is|are|was|were|equals|defined|means|requires|always|never)\b/i.test(lower) ||
      /\d+%|\b\d{4}-\d{2}-\d{2}\b/.test(text);
    const hasFacts = factSignals && text.length > 24;
    const prefSignals = /\b(i prefer|we should always|never do|like it when|dislike)\b/i.test(lower);
    const hasPreferences = prefSignals;

    const suggestedMemoryKinds: MemoryKind[] = ["episode"];
    if (hasFacts) suggestedMemoryKinds.push("fact");
    if (hasPreferences) suggestedMemoryKinds.push("preference");
    if (/because|therefore|conclude|belief/i.test(lower)) {
      suggestedMemoryKinds.push("belief");
    }

    const lengthFactor = Math.min(1, text.length / 2000);
    const entityFactor = hasEntities ? 0.25 : 0;
    const factFactor = hasFacts ? 0.35 : 0;
    const prefFactor = hasPreferences ? 0.2 : 0;
    const surpriseFactor = /!|\b(important|critical|urgent|must)\b/i.test(text) ? 0.15 : 0;
    const estimatedImportance = Math.min(
      1,
      0.15 + lengthFactor * 0.4 + entityFactor + factFactor + prefFactor + surpriseFactor,
    );

    return {
      sourceType,
      estimatedImportance,
      hasEntities,
      hasFacts,
      hasPreferences,
      suggestedMemoryKinds: [...new Set(suggestedMemoryKinds)],
      entityHints: [...entityHints].slice(0, 32),
    };
  }
}
