import type {
  EntityPhase,
  RunDashboardArtifact,
  RunDashboardProjection,
  RunDashboardResearchCitation,
  RunDashboardResearchRun,
  RunDashboardSubagent,
} from "./projection.js";

export type WorkbenchDetailTone = "neutral" | "active" | "success" | "warning" | "danger";

export interface WorkbenchDetailMetric {
  label: string;
  value: string;
  tone: WorkbenchDetailTone;
}

export interface WorkbenchDetailRow {
  label: string;
  value: string;
  href?: string;
}

export interface WorkbenchDetailChip {
  label: string;
  tone: WorkbenchDetailTone;
}

export interface WorkbenchSubagentCandidate {
  id: string;
  focusId: string;
  title: string;
  summary: string;
  phase: EntityPhase;
  tone: WorkbenchDetailTone;
  selected: boolean;
}

export interface WorkbenchArtifactReference {
  id: string;
  label: string;
  source: "input" | "output";
  found: boolean;
  focusId?: string;
  tone: WorkbenchDetailTone;
}

export interface WorkbenchSubagentDetail {
  id: string;
  focusId: string;
  title: string;
  summary: string;
  phase: EntityPhase;
  tone: WorkbenchDetailTone;
  updatedAt: string;
  metrics: WorkbenchDetailMetric[];
  rows: WorkbenchDetailRow[];
  capabilities: WorkbenchDetailChip[];
  artifactRefs: WorkbenchArtifactReference[];
  visualQaHooks: WorkbenchArtifactCard[];
}

export interface WorkbenchSelectedSubagentDrawer {
  candidates: WorkbenchSubagentCandidate[];
  selected?: WorkbenchSubagentDetail;
  emptyMessage?: string;
}

export interface WorkbenchCitationLedgerItem {
  id: string;
  runId: string;
  focusId: string;
  title: string;
  summary: string;
  sourceLabel: string;
  href?: string;
  artifactPointer?: string;
  artifactFocusId?: string;
  traceId?: string;
  tone: WorkbenchDetailTone;
  selected: boolean;
  rows: WorkbenchDetailRow[];
}

export interface WorkbenchCitationLedgerView {
  metrics: WorkbenchDetailMetric[];
  citations: WorkbenchCitationLedgerItem[];
  selected?: WorkbenchCitationLedgerItem;
  emptyMessage?: string;
}

export interface WorkbenchArtifactCard {
  id: string;
  focusId: string;
  title: string;
  summary: string;
  phase: EntityPhase;
  kind?: string;
  path?: string;
  tone: WorkbenchDetailTone;
  selected: boolean;
  visualQa: boolean;
  qaLabels: string[];
  rows: WorkbenchDetailRow[];
  relatedSubagents: WorkbenchDetailChip[];
  relatedCitations: WorkbenchDetailChip[];
}

export interface WorkbenchVisualQaHooks {
  count: number;
  statusLabel: string;
  tone: WorkbenchDetailTone;
  hooks: WorkbenchArtifactCard[];
}

export interface WorkbenchArtifactDetailsView {
  metrics: WorkbenchDetailMetric[];
  cards: WorkbenchArtifactCard[];
  selected?: WorkbenchArtifactCard;
  visualQa: WorkbenchVisualQaHooks;
  emptyMessage?: string;
}

export interface WorkbenchDetailViews {
  subagentDrawer: WorkbenchSelectedSubagentDrawer;
  citationLedger: WorkbenchCitationLedgerView;
  artifactDetails: WorkbenchArtifactDetailsView;
}

export interface WorkbenchDetailViewsInput {
  projection: RunDashboardProjection;
  selectedSubagentId?: string;
  selectedCitationId?: string;
  selectedArtifactId?: string;
}

export function createWorkbenchDetailViews({
  projection,
  selectedSubagentId,
  selectedCitationId,
  selectedArtifactId,
}: WorkbenchDetailViewsInput): WorkbenchDetailViews {
  const artifactDetails = createArtifactDetailsView(projection, selectedArtifactId);
  return {
    subagentDrawer: createSelectedSubagentDrawer(
      projection,
      artifactDetails.cards,
      selectedSubagentId,
    ),
    citationLedger: createCitationLedgerView(projection, selectedCitationId),
    artifactDetails,
  };
}

export function createSelectedSubagentDrawer(
  projection: RunDashboardProjection,
  artifactCards: readonly WorkbenchArtifactCard[] = [],
  selectedSubagentId?: string,
): WorkbenchSelectedSubagentDrawer {
  const subagents = Object.values(projection.subagentDetails).sort(compareByUpdatedDesc);
  const selectedId = normalizeFocusId(selectedSubagentId, "subagent") ??
    subagents.find((item) => isActivePhase(item.phase))?.id ??
    subagents[0]?.id;
  const selectedSubagent = selectedId
    ? subagents.find((item) => item.id === selectedId)
    : undefined;
  const candidates = subagents.map((subagent) => subagentCandidate(subagent, subagent.id === selectedId));

  return {
    candidates,
    ...(selectedSubagent !== undefined
      ? { selected: subagentDetail(selectedSubagent, projection, artifactCards) }
      : { emptyMessage: "No subagent runtime detail has been projected yet." }),
  };
}

export function createCitationLedgerView(
  projection: RunDashboardProjection,
  selectedCitationId?: string,
): WorkbenchCitationLedgerView {
  const citations = buildCitationItems(projection, selectedCitationId);
  const selected = citations.find((item) => item.selected) ?? citations[0];
  const linkedCount = citations.filter((item) => item.href || item.artifactPointer).length;
  const runCount = new Set(citations.map((item) => item.runId)).size;
  return {
    metrics: [
      metric("Citations", String(citations.length), citations.length > 0 ? "active" : "neutral"),
      metric("Runs", String(runCount), runCount > 0 ? "success" : "neutral"),
      metric("Linked", String(linkedCount), linkedCount > 0 ? "success" : "neutral"),
    ],
    citations: citations.map((item) => ({
      ...item,
      selected: selected !== undefined && item.id === selected.id,
    })),
    ...(selected !== undefined ? { selected: { ...selected, selected: true } } : {}),
    ...(citations.length === 0 ? { emptyMessage: "No citations have been captured yet." } : {}),
  };
}

export function createArtifactDetailsView(
  projection: RunDashboardProjection,
  selectedArtifactId?: string,
): WorkbenchArtifactDetailsView {
  const normalizedSelectedId = normalizeFocusId(selectedArtifactId, "artifact");
  const artifacts = Object.values(projection.artifactDetails).sort(compareByUpdatedDesc);
  const selectedId = normalizedSelectedId ?? artifacts[0]?.id;
  const cards = artifacts.map((artifact) =>
    artifactCard(artifact, projection, artifact.id === selectedId),
  );
  const selected = cards.find((card) => card.selected) ?? cards[0];
  const visualHooks = cards.filter((card) => card.visualQa);
  const kinds = new Set(cards.map((card) => card.kind).filter((kind): kind is string => Boolean(kind)));

  return {
    metrics: [
      metric("Artifacts", String(cards.length), cards.length > 0 ? "active" : "neutral"),
      metric("Kinds", String(kinds.size), kinds.size > 0 ? "success" : "neutral"),
      metric("Visual QA", String(visualHooks.length), visualHooks.length > 0 ? "warning" : "neutral"),
    ],
    cards: cards.map((card) => ({
      ...card,
      selected: selected !== undefined && card.id === selected.id,
    })),
    ...(selected !== undefined ? { selected: { ...selected, selected: true } } : {}),
    visualQa: {
      count: visualHooks.length,
      statusLabel: visualHooks.length > 0 ? `${visualHooks.length} hooks` : "none",
      tone: visualHooks.length > 0 ? "warning" : "neutral",
      hooks: visualHooks,
    },
    ...(cards.length === 0 ? { emptyMessage: "No artifacts are available for detail cards yet." } : {}),
  };
}

function subagentCandidate(
  subagent: RunDashboardSubagent,
  selected: boolean,
): WorkbenchSubagentCandidate {
  return {
    id: subagent.id,
    focusId: `subagent:${subagent.id}`,
    title: subagent.contract?.taskPreview ?? subagent.role ?? subagent.id,
    summary: subagent.result?.preview ?? subagent.error ?? subagent.workerId ?? subagent.phase,
    phase: subagent.phase,
    tone: phaseTone(subagent.phase),
    selected,
  };
}

function subagentDetail(
  subagent: RunDashboardSubagent,
  projection: RunDashboardProjection,
  artifactCards: readonly WorkbenchArtifactCard[],
): WorkbenchSubagentDetail {
  const inputRefs = artifactReferences(
    subagent.contract?.inputArtifactRefs ?? [],
    "input",
    projection,
  );
  const outputRefs = artifactReferences(
    subagent.result?.artifactRefs ?? [],
    "output",
    projection,
  );
  const artifactRefs = [...inputRefs, ...outputRefs];
  const refIds = new Set(artifactRefs.map((ref) => ref.id));
  const visualQaHooks = artifactCards.filter((card) => refIds.has(card.id) && card.visualQa);
  const capabilityLabels = [
    ...prefixedValues("tool", subagent.scope?.toolNames),
    ...prefixedValues("skill", subagent.scope?.skillNames),
    ...prefixedValues("mcp", subagent.scope?.mcpServers),
  ];

  return {
    id: subagent.id,
    focusId: `subagent:${subagent.id}`,
    title: subagent.contract?.taskPreview ?? subagent.role ?? subagent.id,
    summary: subagent.result?.preview ?? subagent.error ?? subagent.contract?.modelPreference ?? subagent.phase,
    phase: subagent.phase,
    tone: phaseTone(subagent.phase),
    updatedAt: subagent.updatedAt,
    metrics: [
      metric("Phase", subagent.phase, phaseTone(subagent.phase)),
      metric("Inputs", String(inputRefs.length), inputRefs.length > 0 ? "active" : "neutral"),
      metric("Outputs", String(outputRefs.length), outputRefs.length > 0 ? "success" : "neutral"),
    ],
    rows: [
      ...row("Subagent", subagent.id),
      ...row("Worker", subagent.workerId),
      ...row("Role", subagent.role ?? subagent.contract?.role),
      ...row("Lane", subagent.lane),
      ...row("Requested lane", subagent.requestedLane ?? subagent.contract?.requestedLane),
      ...row("Parent task", subagent.parentTaskId),
      ...row("Parent worker", subagent.parentWorkerId),
      ...row("Trace", subagent.traceId),
      ...row("Model", subagent.contract?.modelPreference),
      ...row("Result", subagent.result?.preview),
      ...row("Error", subagent.error),
    ],
    capabilities: capabilityLabels.map((label) => ({
      label,
      tone: label.startsWith("mcp:") ? "active" : "neutral",
    })),
    artifactRefs,
    visualQaHooks,
  };
}

function buildCitationItems(
  projection: RunDashboardProjection,
  selectedCitationId?: string,
): WorkbenchCitationLedgerItem[] {
  const normalizedSelectedId = normalizeFocusId(selectedCitationId, "citation");
  const runs = Object.values(projection.researchRuns).sort(compareByUpdatedDesc);
  const items: WorkbenchCitationLedgerItem[] = [];

  for (const run of runs) {
    const citations = citationsForRun(run);
    for (const citation of citations) {
      const id = citation?.id ?? "";
      if (!id) continue;
      const artifactFocusId = artifactFocusForPointer(citation?.artifactPointer, projection);
      items.push({
        id,
        runId: run.id,
        focusId: `citation:${id}`,
        title: citation?.title ?? citation?.uri ?? id,
        summary: run.question ?? citation?.sourceRecordId ?? run.id,
        sourceLabel: citation?.sourceKind ?? run.sourcePolicy ?? run.phase,
        ...(citation?.uri !== undefined ? { href: citation.uri } : {}),
        ...(citation?.artifactPointer !== undefined ? { artifactPointer: citation.artifactPointer } : {}),
        ...(artifactFocusId !== undefined ? { artifactFocusId } : {}),
        ...(citation?.traceId !== undefined ? { traceId: citation.traceId } : {}),
        tone: phaseTone(run.phase),
        selected: normalizedSelectedId === id,
        rows: [
          ...row("Citation", id),
          ...row("Run", run.id),
          ...row("Question", run.question),
          ...row("Source", citation?.sourceKind ?? run.sourcePolicy),
          ...row("URI", citation?.uri, citation?.uri),
          ...row("Artifact", citation?.artifactPointer),
          ...row("Source record", citation?.sourceRecordId),
          ...row("Trace", citation?.traceId),
        ],
      });
    }
  }

  if (items.length > 0 && !items.some((item) => item.selected)) {
    items[0] = { ...items[0]!, selected: true };
  }
  return items;
}

function citationsForRun(run: RunDashboardResearchRun): Array<RunDashboardResearchCitation | undefined> {
  const known = run.citations ?? {};
  const ids = unique([
    ...run.citationIds,
    ...Object.keys(known),
    ...(run.latestCitation ? [run.latestCitation.id] : []),
  ]);
  return ids.map((id) => known[id] ?? (run.latestCitation?.id === id ? run.latestCitation : { id }));
}

function artifactCard(
  artifact: RunDashboardArtifact,
  projection: RunDashboardProjection,
  selected: boolean,
): WorkbenchArtifactCard {
  const qaLabels = visualQaLabels(artifact);
  return {
    id: artifact.id,
    focusId: `artifact:${artifact.id}`,
    title: artifact.title ?? artifact.path ?? artifact.id,
    summary: artifact.summary ?? artifact.path ?? artifact.kind ?? artifact.phase,
    phase: artifact.phase,
    ...(artifact.kind !== undefined ? { kind: artifact.kind } : {}),
    ...(artifact.path !== undefined ? { path: artifact.path } : {}),
    tone: phaseTone(artifact.phase),
    selected,
    visualQa: qaLabels.length > 0,
    qaLabels,
    rows: [
      ...row("Artifact", artifact.id),
      ...row("Kind", artifact.kind),
      ...row("Path", artifact.path),
      ...row("Phase", artifact.phase),
      ...row("Created", artifact.createdAt),
      ...row("Updated", artifact.updatedAt),
      ...row("Trace", artifact.traceId),
      ...row("Summary", artifact.summary),
      ...metadataRows(artifact.metadata),
    ],
    relatedSubagents: relatedSubagents(artifact, projection),
    relatedCitations: relatedCitations(artifact, projection),
  };
}

function artifactReferences(
  refs: readonly string[],
  source: WorkbenchArtifactReference["source"],
  projection: RunDashboardProjection,
): WorkbenchArtifactReference[] {
  return refs.map((ref) => {
    const artifact = resolveArtifactRef(ref, projection);
    return {
      id: artifact?.id ?? ref,
      label: artifact?.title ?? artifact?.path ?? ref,
      source,
      found: artifact !== undefined,
      ...(artifact !== undefined ? { focusId: `artifact:${artifact.id}` } : {}),
      tone: artifact !== undefined ? phaseTone(artifact.phase) : "warning",
    };
  });
}

function resolveArtifactRef(
  ref: string,
  projection: RunDashboardProjection,
): RunDashboardArtifact | undefined {
  return Object.values(projection.artifactDetails).find((artifact) =>
    artifact.id === ref ||
    artifact.path === ref ||
    ref.endsWith(`/${artifact.id}`) ||
    (artifact.path !== undefined && ref.endsWith(artifact.path)),
  );
}

function relatedSubagents(
  artifact: RunDashboardArtifact,
  projection: RunDashboardProjection,
): WorkbenchDetailChip[] {
  return Object.values(projection.subagentDetails)
    .filter((subagent) => {
      const refs = [
        ...(subagent.contract?.inputArtifactRefs ?? []),
        ...(subagent.result?.artifactRefs ?? []),
      ];
      return refs.some((ref) => artifactMatchesRef(artifact, ref));
    })
    .sort(compareByUpdatedDesc)
    .slice(0, 4)
    .map((subagent) => ({
      label: subagent.role ?? subagent.id,
      tone: phaseTone(subagent.phase),
    }));
}

function relatedCitations(
  artifact: RunDashboardArtifact,
  projection: RunDashboardProjection,
): WorkbenchDetailChip[] {
  return Object.values(projection.researchRuns)
    .flatMap((run) =>
      citationsForRun(run).map((citation) => ({ run, citation })),
    )
    .filter(({ citation }) =>
      citation !== undefined &&
      citation.artifactPointer !== undefined &&
      artifactMatchesRef(artifact, citation.artifactPointer),
    )
    .slice(0, 4)
    .map(({ run, citation }) => ({
      label: citation?.title ?? citation?.id ?? run.id,
      tone: phaseTone(run.phase),
    }));
}

function artifactFocusForPointer(
  pointer: string | undefined,
  projection: RunDashboardProjection,
): string | undefined {
  if (!pointer) return undefined;
  const artifact = resolveArtifactRef(pointer.replace(/^artifact:\/\//u, ""), projection) ??
    Object.values(projection.artifactDetails).find((item) => artifactMatchesRef(item, pointer));
  return artifact ? `artifact:${artifact.id}` : undefined;
}

function artifactMatchesRef(artifact: RunDashboardArtifact, ref: string): boolean {
  return ref === artifact.id ||
    ref.includes(artifact.id) ||
    (artifact.path !== undefined && (ref === artifact.path || ref.includes(artifact.path)));
}

function visualQaLabels(artifact: RunDashboardArtifact): string[] {
  const haystack = [
    artifact.kind,
    artifact.path,
    artifact.title,
    artifact.summary,
    ...Object.entries(artifact.metadata ?? {}).flatMap(([key, value]) => [key, String(value)]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  const labels: string[] = [];
  if (/\b(screenshot|snapshot|viewport|image|png|jpg|jpeg|webp)\b/u.test(haystack)) {
    labels.push("screenshot");
  }
  if (/\b(visual[-_\s]?qa|visual|pixel|diff|regression)\b/u.test(haystack)) {
    labels.push("visual qa");
  }
  if (/\b(playwright|browser|e2e|lighthouse)\b/u.test(haystack)) {
    labels.push("browser");
  }
  return unique(labels);
}

function metadataRows(
  metadata: RunDashboardArtifact["metadata"],
): WorkbenchDetailRow[] {
  return Object.entries(metadata ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 6)
    .map(([label, value]) => ({
      label,
      value: String(value),
    }));
}

function phaseTone(phase: EntityPhase): WorkbenchDetailTone {
  if (phase === "failed") return "danger";
  if (phase === "completed" || phase === "resolved") return "success";
  if (phase === "running" || phase === "created" || phase === "updated" || phase === "ready") {
    return "active";
  }
  if (phase === "pending" || phase === "requested") return "warning";
  return "neutral";
}

function isActivePhase(phase: EntityPhase): boolean {
  return !["completed", "failed", "resolved"].includes(phase);
}

function compareByUpdatedDesc<T extends { id: string; updatedAt?: string }>(a: T, b: T): number {
  const byUpdated = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  if (byUpdated !== 0) return byUpdated;
  return a.id.localeCompare(b.id);
}

function metric(label: string, value: string, tone: WorkbenchDetailTone): WorkbenchDetailMetric {
  return { label, value, tone };
}

function row(label: string, value: string | number | undefined, href?: string): WorkbenchDetailRow[] {
  if (value === undefined) return [];
  const normalized = String(value);
  if (normalized.trim().length === 0) return [];
  return [{ label, value: normalized, ...(href !== undefined ? { href } : {}) }];
}

function prefixedValues(prefix: string, values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => `${prefix}:${value}`);
}

function normalizeFocusId(value: string | undefined, prefix: string): string | undefined {
  if (!value) return undefined;
  return value.startsWith(`${prefix}:`) ? value.slice(prefix.length + 1) : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
