import type {
  ResearchSourceAdapter,
  ResearchSourceKind,
} from "./types.js";

export function composeResearchSourceAdapters(
  adapters: readonly ResearchSourceAdapter[] = [],
): ResearchSourceAdapter[] {
  const grouped = new Map<ResearchSourceKind, ResearchSourceAdapter[]>();
  for (const adapter of adapters) {
    const peers = grouped.get(adapter.kind) ?? [];
    peers.push(adapter);
    grouped.set(adapter.kind, peers);
  }
  return [...grouped.entries()].map(([kind, peers]) =>
    peers.length === 1 ? peers[0]! : fanoutResearchSourceAdapter(kind, peers),
  );
}

function fanoutResearchSourceAdapter(
  kind: ResearchSourceKind,
  adapters: readonly ResearchSourceAdapter[],
): ResearchSourceAdapter {
  return {
    kind,
    async search(request) {
      const evidence: Awaited<ReturnType<ResearchSourceAdapter["search"]>> = [];
      for (const adapter of adapters) {
        evidence.push(...await adapter.search(request));
      }
      return evidence;
    },
  };
}
