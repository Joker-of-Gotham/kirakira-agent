import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  Cpu,
  ExternalLink,
  FileSearch,
  GitBranch,
  ListTree,
  Play,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Square,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import {
  createMcpDirectoryView,
  createEmptyRunDashboard,
  createRunInspector,
  createSubagentTopologyView,
  projectRunDashboard,
  runtimeTransportOrchestration,
  runtimeTransportSupportsArtifactContent,
  type RuntimeArtifactContent,
  type RuntimeMcpDirectoryTool,
  type RuntimeMcpDirectoryView,
  type RuntimeMcpListResult,
  type RunDashboardArtifact,
  type RunInspectorFocus,
  type RunInspectorLane,
  type RunInspectorProjection,
  type RunDashboardProjection,
  type RunDashboardStatus,
  type RuntimeConnectionState,
  type RuntimeTransport,
  type RuntimeTransportEvent,
  type RuntimeTransportStatus,
  type SubagentTopologyView,
} from "@kirakira/frontend-core";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunEvent, RuntimeRunMode } from "@kirakira/runtime-contracts";
import { createMockRuntimeTransport } from "./mock-transport.js";

export interface KirakiraWorkbenchProps {
  transport?: RuntimeTransport;
  productName?: string;
  environmentLabel?: string;
  initialPrompt?: string;
}

interface RunHistoryItem {
  runId: string;
  prompt: string;
  status: RunDashboardStatus;
  eventCount: number;
  updatedAt: string;
}

interface ArtifactPreviewState {
  artifactId: string;
  status: "loading" | "ready" | "error";
  content?: RuntimeArtifactContent;
  message?: string;
}

interface McpDirectoryState {
  status: "idle" | "loading" | "ready" | "error";
  result?: RuntimeMcpListResult;
  message?: string;
}

const defaultPrompt =
  "Port the runtime contract surface into a browser-safe UI and secure desktop bridge.";

const statusLabel: Record<RunDashboardStatus, string> = {
  idle: "Idle",
  pending: "Pending",
  running: "Running",
  completed: "Complete",
  failed: "Failed",
  drained: "Drained",
};

const mergeEvent = (events: RunEvent[], event: RunEvent): RunEvent[] => {
  if (events.some((item) => item.id === event.id)) return events;
  return [...events, event].sort((a, b) => {
    const bySeq = (a.checkpointSeq ?? 0) - (b.checkpointSeq ?? 0);
    if (bySeq !== 0) return bySeq;
    return a.timestamp.localeCompare(b.timestamp);
  });
};

const countEntities = (projection: RunDashboardProjection): number =>
  Object.values(projection.entities).reduce(
    (total, entityMap) => total + Object.keys(entityMap).length,
    0,
  );

const formatClock = (value?: string): string => {
  if (!value) return "Not started";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
};

const textValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

export function KirakiraWorkbench({
  transport,
  productName = "Kirakira Agent",
  environmentLabel = "Local runtime",
  initialPrompt = defaultPrompt,
}: KirakiraWorkbenchProps) {
  const runtime = useMemo(() => transport ?? createMockRuntimeTransport(), [transport]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [connection, setConnection] = useState<RuntimeConnectionState>("idle");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [runId, setRunId] = useState<string | undefined>();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<RuntimeRunMode>("interactive");
  const [error, setError] = useState<string | undefined>();
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeTransportStatus | undefined>();
  const [mcpDirectory, setMcpDirectory] = useState<McpDirectoryState>({ status: "idle" });
  const [selectedMcpToolId, setSelectedMcpToolId] = useState<string | undefined>();
  const [isSubmitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [selectedFocusId, setSelectedFocusId] = useState<string | undefined>();
  const [artifactPreviews, setArtifactPreviews] = useState<Record<string, ArtifactPreviewState>>(
    {},
  );

  useEffect(() => {
    let disposed = false;
    setRuntimeStatus(undefined);
    setConnection("connecting");
    runtime
      .connect()
      .then(async () => {
        if (!disposed) setConnection("connected");
        const status = runtime.getStatus
          ? await runtime.getStatus().catch((err: unknown) => ({
              mode: runtime.mode,
              state: "unknown" as const,
              label: "Runtime status",
              detail: err instanceof Error ? err.message : String(err),
            }))
          : {
              mode: runtime.mode,
              state: "unknown" as const,
              label: "Runtime status",
              detail: "No status provider",
            };
        if (!disposed) setRuntimeStatus(status);
        if (!disposed) {
          setMcpDirectory({ status: "loading" });
          runtime
            .listMcpTools({
              includeTools: true,
              startServers: false,
            })
            .then((result) => {
              if (!disposed) setMcpDirectory({ status: "ready", result });
            })
            .catch((err: unknown) => {
              if (!disposed) {
                setMcpDirectory({
                  status: "error",
                  message: err instanceof Error ? err.message : String(err),
                });
              }
            });
        }
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setConnection("degraded");
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      disposed = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      runtime.disconnect();
    };
  }, [runtime]);

  const refreshMcpDirectory = useCallback(
    async (startServers = false) => {
      setMcpDirectory((state) => ({
        status: "loading",
        ...(state.result ? { result: state.result } : {}),
      }));
      try {
        const result = await runtime.listMcpTools({
          includeTools: true,
          startServers,
        });
        setMcpDirectory({ status: "ready", result });
      } catch (err) {
        setMcpDirectory({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [runtime],
  );

  useEffect(() => {
    setMcpDirectory({ status: "idle" });
    setSelectedMcpToolId(undefined);
  }, [runtime]);

  const projection = useMemo(
    () => projectRunDashboard(createEmptyRunDashboard(runId), events, { latestEventLimit: 40 }),
    [events, runId],
  );
  const inspector = useMemo(
    () => createRunInspector(projection, { selectedFocusId }),
    [projection, selectedFocusId],
  );
  const timelineEvents = useMemo(
    () => [...projection.latestEvents].reverse(),
    [projection.latestEvents],
  );

  useEffect(() => {
    if (!runId) return;
    setHistory((items) => {
      const next: RunHistoryItem = {
        runId,
        prompt,
        status: projection.status,
        eventCount: events.length,
        updatedAt: projection.updatedAt ?? new Date().toISOString(),
      };
      return [next, ...items.filter((item) => item.runId !== runId)].slice(0, 8);
    });
  }, [events.length, projection.status, projection.updatedAt, prompt, runId]);

  const handleTransportEvent = (event: RuntimeTransportEvent) => {
    if (event.type === "connection") {
      setConnection(event.state);
      return;
    }
    if (event.type === "error") {
      setConnection("degraded");
      setError(event.message);
      return;
    }
    setEvents((items) => mergeEvent(items, event.event));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await runtime.submitPrompt({ prompt, mode });
      unsubscribeRef.current?.();
      setRunId(result.runId);
      setEvents([]);
      setArtifactPreviews({});
      unsubscribeRef.current = runtime.subscribeRun(result.runId, handleTransportEvent);
    } catch (err) {
      setConnection("degraded");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (decision: "approve" | "reject") => {
    const ticketId = projection.pendingApprovalIds[0];
    if (!runId || !ticketId) return;
    await runtime.approve({
      runId,
      ticketId,
      decision,
      reason: decision === "approve" ? "Approved from Kirakira workbench" : "Rejected",
    });
  };

  const cancel = async () => {
    if (!runId) return;
    await runtime.cancel(runId, "Cancelled from Kirakira workbench");
  };

  const topologyManifest = runtimeTransportOrchestration(runtimeStatus);
  const topology = useMemo(
    () => createSubagentTopologyView(projection, topologyManifest),
    [projection, topologyManifest],
  );
  const mcpDirectoryView = useMemo(
    () => createMcpDirectoryView(mcpDirectory.result),
    [mcpDirectory.result],
  );
  const selectedMcpTool = useMemo(
    () =>
      mcpDirectoryView.tools.find((tool) => tool.id === selectedMcpToolId) ??
      mcpDirectoryView.tools[0],
    [mcpDirectoryView.tools, selectedMcpToolId],
  );
  const researchRuns = Object.values(projection.researchRuns);
  const latestResearch = researchRuns[researchRuns.length - 1];
  const artifacts = Object.values(projection.artifactDetails).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const selectedArtifactId = inspector.selectedFocus?.kind === "artifact"
    ? inspector.selectedFocus.id.replace(/^artifact:/, "")
    : undefined;
  const selectedArtifactPreviewKey =
    runId && selectedArtifactId ? `${runId}:${selectedArtifactId}` : undefined;
  const selectedArtifactPreview = selectedArtifactPreviewKey
    ? artifactPreviews[selectedArtifactPreviewKey]
    : undefined;
  const artifactContentCapabilityKnown = runtimeStatus !== undefined;
  const artifactContentAvailable = runtimeTransportSupportsArtifactContent(runtimeStatus);
  const selectedArtifactPreviewDisplay = selectedArtifactPreview ??
    (selectedArtifactId && artifactContentCapabilityKnown && !artifactContentAvailable
      ? {
          artifactId: selectedArtifactId,
          status: "error" as const,
          message: "Artifact preview is not enabled by this runtime",
        }
      : undefined);
  const pendingApproval = projection.pendingApprovalIds[0];
  const graph = projection.graph;
  const graphNodes = Object.values(graph.nodes).sort((a, b) => {
    if (a.id === graph.rootNodeId) return -1;
    if (b.id === graph.rootNodeId) return 1;
    return a.id.localeCompare(b.id);
  });
  const graphProgress = graph.nodeCount > 0
    ? Math.round((graph.completedNodeCount / graph.nodeCount) * 100)
    : 0;

  useEffect(() => {
    if (!runId || !selectedArtifactId || !selectedArtifactPreviewKey) return;
    if (!artifactContentAvailable) return;
    const existing = artifactPreviews[selectedArtifactPreviewKey];
    if (existing) return;
    let disposed = false;
    setArtifactPreviews((items) => ({
      ...items,
      [selectedArtifactPreviewKey]: {
        artifactId: selectedArtifactId,
        status: "loading",
      },
    }));
    runtime
      .getArtifactContent({ runId, artifactId: selectedArtifactId })
      .then((content) => {
        if (disposed) return;
        setArtifactPreviews((items) => ({
          ...items,
          [selectedArtifactPreviewKey]: {
            artifactId: selectedArtifactId,
            status: "ready",
            content,
          },
        }));
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setArtifactPreviews((items) => ({
          ...items,
          [selectedArtifactPreviewKey]: {
            artifactId: selectedArtifactId,
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          },
        }));
      });
    return () => {
      disposed = true;
    };
  }, [
    artifactPreviews,
    artifactContentAvailable,
    runId,
    runtime,
    selectedArtifactId,
    selectedArtifactPreviewKey,
  ]);

  return (
    <main className="kk-shell">
      <aside className="kk-sidebar" aria-label="Run navigation">
        <div className="kk-brand">
          <div className="kk-brand-mark" aria-hidden="true">
            <PlugZap size={22} />
          </div>
          <div>
            <strong>{productName}</strong>
            <span>{environmentLabel}</span>
          </div>
        </div>

        <nav className="kk-nav" aria-label="Workspace views">
          <button type="button" className="kk-nav-item kk-nav-item-active">
            <Activity size={18} />
            Runs
          </button>
          <button type="button" className="kk-nav-item">
            <Bot size={18} />
            Agents
          </button>
          <button type="button" className="kk-nav-item">
            <FileSearch size={18} />
            Research
          </button>
          <button type="button" className="kk-nav-item">
            <ShieldCheck size={18} />
            Approvals
          </button>
        </nav>

        <section className="kk-run-list" aria-label="Recent runs">
          <div className="kk-section-heading">
            <span>Recent Runs</span>
            <span>{history.length}</span>
          </div>
          {history.length === 0 ? (
            <div className="kk-empty">No runs yet</div>
          ) : (
            history.map((item) => (
              <button key={item.runId} type="button" className="kk-run-item">
                <span className={`kk-dot kk-dot-${item.status}`} />
                <span>
                  <strong>{item.prompt}</strong>
                  <small>
                    {item.eventCount} events · {formatClock(item.updatedAt)}
                  </small>
                </span>
              </button>
            ))
          )}
        </section>
      </aside>

      <section className="kk-workspace" aria-label="Runtime workspace">
        <header className="kk-topbar">
          <div>
            <p className="kk-kicker">Runtime workbench</p>
            <h1>{projection.runId ?? "Ready for a run"}</h1>
          </div>
          <div className={`kk-connection kk-connection-${connection}`}>
            <CircleDot size={16} />
            {connection}
          </div>
        </header>

        <section className="kk-stats" aria-label="Run summary">
          <Stat label="Status" value={statusLabel[projection.status]} icon={<Cpu size={18} />} />
          <Stat label="Events" value={String(events.length)} icon={<GitBranch size={18} />} />
          <Stat label="Entities" value={String(countEntities(projection))} icon={<Bot size={18} />} />
          <Stat label="Updated" value={formatClock(projection.updatedAt)} icon={<Clock3 size={18} />} />
        </section>

        <section className="kk-main-grid">
          <div className="kk-primary-pane">
            <div className="kk-pane-header">
              <div>
                <p className="kk-kicker">Timeline</p>
                <h2>Run Events</h2>
              </div>
              <button type="button" className="kk-icon-button" onClick={cancel} disabled={!runId}>
                <Square size={17} />
                <span>Cancel</span>
              </button>
            </div>

            <ol
              className="kk-timeline"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {timelineEvents.length === 0 ? (
                <li className="kk-empty kk-empty-large">Start a run to populate the timeline</li>
              ) : (
                timelineEvents.map((item) => (
                  <li key={item.id} className="kk-timeline-item">
                    <span className="kk-timeline-rail" />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail ?? item.kind}</p>
                    </div>
                    <time>{formatClock(item.timestamp)}</time>
                  </li>
                ))
              )}
            </ol>
          </div>

          <SwarmTopologyPanel
            topology={topology}
            onSelectFocus={setSelectedFocusId}
          />
        </section>

        <RunInspectorPanel
          inspector={inspector}
          artifactPreview={selectedArtifactPreviewDisplay}
          onSelectFocus={setSelectedFocusId}
        />

        <form className="kk-composer" onSubmit={submit}>
          <div className="kk-mode-switch" role="group" aria-label="Run mode">
            {(["interactive", "headless", "dry_run"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                className={mode === item ? "kk-mode-active" : ""}
                onClick={() => setMode(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="kk-prompt-label">
            <span>Prompt</span>
            <textarea
              value={prompt}
              rows={3}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <button type="submit" className="kk-submit" disabled={isSubmitting || connection === "connecting"}>
            <Play size={18} />
            {isSubmitting ? "Submitting" : "Run"}
          </button>
        </form>
      </section>

      <aside className="kk-right-rail" aria-label="Run intelligence">
        <section className="kk-rail-section" aria-label="Execution graph">
          <div className="kk-pane-header">
            <div>
              <p className="kk-kicker">Graph</p>
              <h2>Execution</h2>
            </div>
            <GitBranch size={18} />
          </div>
          {graph.nodeCount === 0 ? (
            <div className="kk-empty">No graph compiled</div>
          ) : (
            <div className="kk-graph">
              <div className="kk-graph-summary">
                <strong>
                  {graph.completedNodeCount}/{graph.nodeCount}
                </strong>
                <span>{graphProgress}% complete</span>
              </div>
              <progress
                className="kk-graph-meter"
                aria-label={`Execution graph ${graphProgress}% complete`}
                value={graphProgress}
                max={100}
              />
              <dl className="kk-graph-metrics">
                <div>
                  <dt>Running</dt>
                  <dd>{graph.runningNodeCount}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{graph.failedNodeCount}</dd>
                </div>
                <div>
                  <dt>Edges</dt>
                  <dd>{graph.edgeCount}</dd>
                </div>
              </dl>
              <ol className="kk-graph-nodes">
                {graphNodes.slice(0, 6).map((node) => (
                  <li key={node.id} className="kk-graph-node">
                    <span className={`kk-dot kk-dot-${node.phase}`} />
                    <div>
                      <strong>{node.description ?? node.id}</strong>
                      <small>{node.kind ?? node.id}</small>
                    </div>
                    <span className={`kk-pill kk-pill-${node.phase}`}>{node.phase}</span>
                  </li>
                ))}
              </ol>
              {graph.lastCheckpointId ? (
                <small className="kk-graph-checkpoint">
                  Checkpoint {graph.lastCheckpointId}
                </small>
              ) : null}
            </div>
          )}
        </section>

        <OutputArtifactsPanel
          artifacts={artifacts}
          onSelectArtifact={(id) => setSelectedFocusId(`artifact:${id}`)}
        />

        <section className="kk-rail-section">
          <div className="kk-pane-header">
            <div>
              <p className="kk-kicker">Research</p>
              <h2>Evidence</h2>
            </div>
            <FileSearch size={18} />
          </div>
          {!latestResearch ? (
            <div className="kk-empty">No evidence yet</div>
          ) : (
            <div className="kk-research">
              <strong>{latestResearch.question ?? latestResearch.id}</strong>
              <span>{latestResearch.phase}</span>
              {latestResearch.latestCitation ? (
                <a href={latestResearch.latestCitation.uri} target="_blank" rel="noreferrer">
                  {latestResearch.latestCitation.title ?? latestResearch.latestCitation.uri}
                </a>
              ) : null}
            </div>
          )}
        </section>

        <McpDirectoryPanel
          state={mcpDirectory}
          view={mcpDirectoryView}
          selectedTool={selectedMcpTool}
          selectedToolId={selectedMcpTool?.id}
          onSelectTool={setSelectedMcpToolId}
          onRefresh={() => void refreshMcpDirectory(false)}
          onStartAndRefresh={() => void refreshMcpDirectory(true)}
        />

        <section className="kk-rail-section">
          <div className="kk-pane-header">
            <div>
              <p className="kk-kicker">Approvals</p>
              <h2>Gate</h2>
            </div>
            <ShieldCheck size={18} />
          </div>
          {pendingApproval ? (
            <div className="kk-approval">
              <AlertTriangle size={18} />
              <strong>{pendingApproval}</strong>
              <div className="kk-approval-actions">
                <button type="button" onClick={() => void approve("reject")}>
                  Reject
                </button>
                <button type="button" onClick={() => void approve("approve")}>
                  <CheckCircle2 size={16} />
                  Approve
                </button>
              </div>
            </div>
          ) : (
            <div className="kk-empty">No pending approvals</div>
          )}
        </section>

        <section className="kk-rail-section">
          <div className="kk-pane-header">
            <div>
              <p className="kk-kicker">Session</p>
              <h2>Runtime</h2>
            </div>
            <TerminalSquare size={18} />
          </div>
          <dl className="kk-runtime-list">
            <div>
              <dt>Transport</dt>
              <dd>{runtime.mode}</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd>
                {runtimeStatus ? (
                  <>
                    <span>{`${runtimeStatus.state}, ${runtimeStatus.label}`}</span>
                    {runtimeStatus.detail ? (
                      <span className="kk-runtime-detail">{runtimeStatus.detail}</span>
                    ) : null}
                  </>
                ) : (
                  "checking"
                )}
              </dd>
            </div>
            <div>
              <dt>Run</dt>
              <dd>{runId ?? "none"}</dd>
            </div>
            <div>
              <dt>Error</dt>
              <dd>{textValue(error) ?? "none"}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </main>
  );
}

function McpDirectoryPanel({
  state,
  view,
  selectedTool,
  selectedToolId,
  onSelectTool,
  onRefresh,
  onStartAndRefresh,
}: {
  state: McpDirectoryState;
  view: RuntimeMcpDirectoryView;
  selectedTool?: RuntimeMcpDirectoryTool;
  selectedToolId?: string;
  onSelectTool: (id: string) => void;
  onRefresh: () => void;
  onStartAndRefresh: () => void;
}) {
  const loading = state.status === "loading";
  return (
    <section className="kk-rail-section kk-mcp-panel" aria-label="MCP directory">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">MCP</p>
          <h2>Tools</h2>
        </div>
        <div className="kk-mcp-actions">
          <button type="button" className="kk-icon-button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="kk-icon-button"
            onClick={onStartAndRefresh}
            disabled={loading}
          >
            <PlugZap size={15} />
            <span>Scan</span>
          </button>
        </div>
      </div>

      <dl className="kk-mcp-summary">
        <div>
          <dt>Servers</dt>
          <dd>{view.summary.serverCount}</dd>
        </div>
        <div>
          <dt>Ready</dt>
          <dd>{view.summary.readyServerCount}</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>{view.summary.toolCount}</dd>
        </div>
      </dl>

      {state.status === "error" ? (
        <div className="kk-empty kk-mcp-error">{state.message ?? "MCP discovery failed"}</div>
      ) : null}

      {view.servers.length === 0 && state.status !== "error" ? (
        <div className="kk-empty">{loading ? "Loading MCP directory" : "No MCP servers"}</div>
      ) : (
        <div className="kk-mcp-directory">
          <div className="kk-mcp-server-list">
            {view.servers.map((server) => (
              <article key={server.name} className={`kk-mcp-server kk-mcp-server-${server.tone}`}>
                <header>
                  <span className={`kk-dot kk-dot-${server.tone}`} />
                  <div>
                    <strong>{server.name}</strong>
                    <small>{server.health}</small>
                  </div>
                  <span>{server.toolCount}</span>
                </header>
                {server.error ? <p>{server.error}</p> : null}
                {server.tools.length > 0 ? (
                  <div className="kk-mcp-tool-list">
                    {server.tools.slice(0, 5).map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        className={
                          tool.id === selectedToolId
                            ? "kk-mcp-tool kk-mcp-tool-active"
                            : "kk-mcp-tool"
                        }
                        aria-pressed={tool.id === selectedToolId}
                        onClick={() => onSelectTool(tool.id)}
                      >
                        <Wrench size={14} />
                        <span>
                          <strong>{tool.title}</strong>
                          <small>
                            {tool.inputPropertyCount} fields / {tool.requiredInputCount} required
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <McpToolDetail tool={selectedTool} />
        </div>
      )}
    </section>
  );
}

function McpToolDetail({ tool }: { tool?: RuntimeMcpDirectoryTool }) {
  if (!tool) return <div className="kk-empty">No tools discovered</div>;
  return (
    <article className="kk-mcp-tool-detail">
      <header>
        <span>{tool.server}</span>
        <h3>{tool.title}</h3>
        <p>{tool.description ?? tool.name}</p>
      </header>
      <dl>
        <div>
          <dt>Tool</dt>
          <dd>{tool.name}</dd>
        </div>
        <div>
          <dt>Inputs</dt>
          <dd>
            {tool.inputPropertyCount} fields, {tool.requiredInputCount} required
          </dd>
        </div>
      </dl>
      <pre>{JSON.stringify(tool.inputSchema ?? { type: "object" }, null, 2)}</pre>
    </article>
  );
}

function SwarmTopologyPanel({
  topology,
  onSelectFocus,
}: {
  topology: SubagentTopologyView;
  onSelectFocus: (id: string) => void;
}) {
  return (
    <section className="kk-agent-pane kk-topology-panel" aria-label="Subagent swarm topology">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Swarm</p>
          <h2>Topology</h2>
        </div>
        <span className="kk-count">
          {topology.summary.activeWorkerCount}/{topology.summary.workerCount}
        </span>
      </div>

      <dl className="kk-topology-summary">
        <div>
          <dt>Roles</dt>
          <dd>{topology.summary.roleCount}</dd>
        </div>
        <div>
          <dt>Planned</dt>
          <dd>{topology.summary.plannedTaskCount}</dd>
        </div>
        <div>
          <dt>Handoffs</dt>
          <dd>{topology.summary.handoffCount}</dd>
        </div>
        <div className={topology.summary.mismatchCount > 0 ? "kk-topology-warn" : ""}>
          <dt>Mismatch</dt>
          <dd>{topology.summary.mismatchCount}</dd>
        </div>
      </dl>

      {topology.roles.length === 0 ? (
        <div className="kk-empty">No topology published</div>
      ) : (
        <div className="kk-topology-lanes">
          {topology.lanes.map((lane) => (
            <section key={lane.id} className="kk-topology-lane" aria-label={`${lane.label} lane`}>
              <header>
                <div>
                  <strong>{lane.label}</strong>
                  <small>
                    {lane.capacity !== undefined ? `capacity ${lane.capacity}` : "elastic"}
                  </small>
                </div>
                <span>{lane.activeWorkerCount}/{lane.workerCount}</span>
              </header>

              <div className="kk-topology-roles">
                {lane.roles.map((role) => (
                  <article key={role.id} className="kk-topology-role">
                    <div className="kk-topology-role-head">
                      <div>
                        <strong>{role.label}</strong>
                        <small>{role.description ?? role.sources.join(" / ")}</small>
                      </div>
                      <span className={`kk-pill kk-pill-${role.phase}`}>{role.phase}</span>
                    </div>

                    <div className="kk-topology-role-meta">
                      <span>{role.sources.join(" / ") || "manifest"}</span>
                      <span>{role.plannedTaskCount} planned</span>
                      <span>{role.activeWorkerCount} active</span>
                      {role.mismatchCount > 0 ? (
                        <span className="kk-topology-warn">{role.mismatchCount} lane drift</span>
                      ) : null}
                    </div>

                    {role.capabilityLabels.length > 0 ? (
                      <div className="kk-topology-chips" aria-label={`${role.label} capabilities`}>
                        {role.capabilityLabels.slice(0, 5).map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                        {role.capabilityLabels.length > 5 ? (
                          <span>+{role.capabilityLabels.length - 5}</span>
                        ) : null}
                      </div>
                    ) : null}

                    {role.workers.length > 0 ? (
                      <div className="kk-topology-workers">
                        {role.workers.slice(0, 3).map((worker) => (
                          <button
                            key={worker.id}
                            type="button"
                            className="kk-topology-worker"
                            onClick={() => onSelectFocus(`subagent:${worker.id}`)}
                          >
                            <span className={`kk-dot kk-dot-${worker.phase}`} />
                            <span>
                              <strong>{worker.id}</strong>
                              <small>
                                {worker.taskPreview ?? worker.requestedLane ?? worker.lane ?? worker.phase}
                              </small>
                            </span>
                            <span>{worker.phase}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function ArtifactContentPreview({ preview }: { preview?: ArtifactPreviewState }) {
  if (!preview) return null;
  if (preview.status === "loading") {
    return <div className="kk-artifact-preview kk-artifact-preview-muted">Loading preview</div>;
  }
  if (preview.status === "error") {
    return (
      <div className="kk-artifact-preview kk-artifact-preview-muted">
        {preview.message ?? "Preview unavailable"}
      </div>
    );
  }
  const content = preview.content;
  if (!content) return null;
  if (content.encoding !== "utf8") {
    return (
      <div className="kk-artifact-preview kk-artifact-preview-muted">
        Binary artifact, {content.sizeBytes} bytes
        {content.truncated ? " (truncated)" : ""}
      </div>
    );
  }
  return (
    <div className="kk-artifact-preview">
      <div>
        <strong>{content.path}</strong>
        <span>
          {content.sizeBytes} bytes{content.truncated ? ", truncated" : ""}
        </span>
      </div>
      <pre>{content.content || "Empty artifact"}</pre>
    </div>
  );
}

function OutputArtifactsPanel({
  artifacts,
  onSelectArtifact,
}: {
  artifacts: RunDashboardArtifact[];
  onSelectArtifact: (id: string) => void;
}) {
  return (
    <section className="kk-rail-section" aria-label="Run outputs">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Outputs</p>
          <h2>Artifacts</h2>
        </div>
        <FileSearch size={18} />
      </div>
      {artifacts.length === 0 ? (
        <div className="kk-empty">No artifacts yet</div>
      ) : (
        <div className="kk-artifact-list">
          {artifacts.slice(0, 4).map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              className="kk-artifact-row"
              onClick={() => onSelectArtifact(artifact.id)}
            >
              <span className={`kk-dot kk-dot-${artifact.phase}`} />
              <span>
                <strong>{artifact.title ?? artifact.path ?? artifact.id}</strong>
                <small>{artifact.kind ?? artifact.phase}</small>
              </span>
              <span className={`kk-pill kk-pill-${artifact.phase}`}>{artifact.phase}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <article className="kk-stat">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

const focusKindLabel: Record<RunInspectorFocus["kind"], string> = {
  run: "Run",
  graph: "Graph",
  subagent: "Subagent",
  research: "Research",
  approval: "Approval",
  tool: "Tool",
  artifact: "Artifact",
};

function RunInspectorPanel({
  inspector,
  artifactPreview,
  onSelectFocus,
}: {
  inspector: RunInspectorProjection;
  artifactPreview?: ArtifactPreviewState;
  onSelectFocus: (id: string) => void;
}) {
  const focus = inspector.selectedFocus;
  const checkpointLabel = inspector.checkpoint
    ? `Checkpoint ${inspector.checkpoint.id}${inspector.checkpoint.seq !== undefined ? ` #${inspector.checkpoint.seq}` : ""}`
    : `${inspector.focusItems.length} focus records`;

  return (
    <section className="kk-inspector-panel" aria-labelledby="kk-inspector-heading">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Inspector</p>
          <h2 id="kk-inspector-heading">Run Detail</h2>
        </div>
        <div className="kk-inspector-live" role="status" aria-live="polite">
          <ListTree size={16} />
          {checkpointLabel}
        </div>
      </div>

      <div className="kk-inspector-grid">
        <div className="kk-inspector-lanes" aria-label="Run lanes">
          {inspector.lanes.map((lane) => (
            <LaneMeter key={lane.id} lane={lane} />
          ))}
        </div>

        <div className="kk-focus-list" aria-label="Inspectable records">
          {inspector.focusItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === inspector.selectedFocusId
                  ? "kk-focus-item kk-focus-item-active"
                  : "kk-focus-item"
              }
              aria-pressed={item.id === inspector.selectedFocusId}
              onClick={() => onSelectFocus(item.id)}
            >
              <span className={`kk-dot kk-dot-${item.phase}`} />
              <span>
                <strong>{item.label}</strong>
                <small>{focusKindLabel[item.kind]}</small>
              </span>
              <span className={`kk-pill kk-pill-${item.phase}`}>{item.phase}</span>
            </button>
          ))}
        </div>

        <article className="kk-focus-detail" aria-live="polite">
          {focus ? (
            <>
              <header>
                <span className={`kk-pill kk-pill-${focus.phase}`}>{focusKindLabel[focus.kind]}</span>
                <h3>{focus.label}</h3>
                <p>{focus.summary}</p>
              </header>
              {focus.details.length === 0 ? (
                <div className="kk-empty">No metadata</div>
              ) : (
                <dl className="kk-detail-list">
                  {focus.details.map((item) => (
                    <div key={`${focus.id}-${item.label}`}>
                      <dt>{item.label}</dt>
                      <dd>
                        {item.href ? (
                          <a href={item.href} target="_blank" rel="noreferrer">
                            {item.value}
                            <ExternalLink size={13} aria-hidden="true" />
                          </a>
                        ) : (
                          item.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {focus.kind === "artifact" ? (
                <ArtifactContentPreview preview={artifactPreview} />
              ) : null}
            </>
          ) : (
            <div className="kk-empty">No runtime focus</div>
          )}
        </article>
      </div>
    </section>
  );
}

function LaneMeter({ lane }: { lane: RunInspectorLane }) {
  const activeLabel = lane.count === 0 ? "0" : `${lane.activeCount}/${lane.count}`;
  return (
    <div className="kk-lane-meter">
      <span className={`kk-dot kk-dot-${lane.phase}`} />
      <span>
        <strong>{lane.label}</strong>
        <small>{activeLabel}</small>
      </span>
    </div>
  );
}
