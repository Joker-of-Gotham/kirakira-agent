import type { RecallRequest } from "@kirakira/memory-core";

export interface QueryPlan {
  normalizedQuery: string;
  entityReferences: string[];
  timeWindow?: { from?: string; to?: string };
  activeRoutes: Array<"similarity" | "graph" | "temporal" | "state">;
  perRouteLimit: Record<string, number>;
  tokenBudget: number;
}

const RELATIVE_DAY = /\b(?:yesterday|today|tomorrow)\b/i;
const RELATIVE_WEEK = /\blast\s+week\b|\bpast\s+7\s*days\b/i;
const RELATIVE_MONTH = /\blast\s+month\b|\bpast\s+30\s*days\b/i;
const QTR = /\bQ([1-4])\s+(\d{4})\b/i;

function extractEntities(query: string): string[] {
  const caps = [...query.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)].map((m) => m[0]!);
  const quoted = [...query.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]!);
  return [...new Set([...caps, ...quoted])].slice(0, 24);
}

function parseTimeWindow(query: string, ref: Date): { from?: string; to?: string } | undefined {
  if (!RELATIVE_DAY.test(query) && !RELATIVE_WEEK.test(query) && !RELATIVE_MONTH.test(query) && !QTR.test(query)) {
    return undefined;
  }
  const end = ref.toISOString();
  let from: string | undefined;
  if (RELATIVE_DAY.test(query)) {
    const d = new Date(ref);
    if (/yesterday/i.test(query)) d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(0, 0, 0, 0);
    from = d.toISOString();
  } else if (RELATIVE_WEEK.test(query)) {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() - 7);
    from = d.toISOString();
  } else if (RELATIVE_MONTH.test(query)) {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() - 30);
    from = d.toISOString();
  } else {
    const m = QTR.exec(query);
    if (m) {
      const q = Number(m[1]);
      const y = Number(m[2]);
      const startMonth = (q - 1) * 3;
      const start = new Date(Date.UTC(y, startMonth, 1));
      const nextQStart = new Date(Date.UTC(y, startMonth + 3, 1));
      from = start.toISOString();
      return { from, to: nextQStart.toISOString() };
    }
  }
  return from ? { from, to: end } : undefined;
}

export function planRecallQuery(req: RecallRequest, defaults: { tokenBudget: number }): QueryPlan {
  const normalizedQuery = req.query.trim().toLowerCase();
  const entityReferences = [...new Set([...(req.entityIds ?? []), ...extractEntities(req.query)])];
  const inferredWindow = parseTimeWindow(req.query, new Date());
  const timeWindow = req.timeWindow ?? inferredWindow;

  const activeRoutes: QueryPlan["activeRoutes"] = ["similarity", "graph", "temporal", "state"];
  if (!timeWindow) {
    activeRoutes.splice(activeRoutes.indexOf("temporal"), 1);
  }
  if (!req.runId && !req.sessionId && !/\b(checkpoint|run|session|tool|approval)\b/i.test(req.query)) {
    activeRoutes.splice(activeRoutes.indexOf("state"), 1);
  }

  const tokenBudget = req.tokenBudget ?? defaults.tokenBudget;
  const base = Math.max(8, Math.min(64, Math.floor(tokenBudget / 256)));
  const perRouteLimit: Record<string, number> = {
    similarity: base * 2,
    graph: base,
    temporal: base,
    state: Math.max(4, Math.floor(base / 2)),
  };

  return {
    normalizedQuery: normalizedQuery,
    entityReferences,
    timeWindow,
    activeRoutes,
    perRouteLimit,
    tokenBudget,
  };
}
