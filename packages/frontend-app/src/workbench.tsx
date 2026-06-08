import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  Cpu,
  FileSearch,
  GitBranch,
  Play,
  PlugZap,
  ShieldCheck,
  Square,
  TerminalSquare,
} from "lucide-react";
import {
  createEmptyRunDashboard,
  projectRunDashboard,
  type RunDashboardProjection,
  type RunDashboardStatus,
  type RuntimeConnectionState,
  type RuntimeTransport,
  type RuntimeTransportEvent,
} from "@kirakira/frontend-core";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [isSubmitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);

  useEffect(() => {
    let disposed = false;
    setConnection("connecting");
    runtime
      .connect()
      .then(() => {
        if (!disposed) setConnection("connected");
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

  const projection = useMemo(
    () => projectRunDashboard(createEmptyRunDashboard(runId), events, { latestEventLimit: 40 }),
    [events, runId],
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

  const subagents = Object.values(projection.subagentDetails);
  const researchRuns = Object.values(projection.researchRuns);
  const latestResearch = researchRuns[researchRuns.length - 1];
  const pendingApproval = projection.pendingApprovalIds[0];

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

            <ol className="kk-timeline">
              {projection.latestEvents.length === 0 ? (
                <li className="kk-empty kk-empty-large">Start a run to populate the timeline</li>
              ) : (
                projection.latestEvents.map((item) => (
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

          <div className="kk-agent-pane">
            <div className="kk-pane-header">
              <div>
                <p className="kk-kicker">Subagents</p>
                <h2>Delegation</h2>
              </div>
              <span className="kk-count">{subagents.length}</span>
            </div>
            <div className="kk-agent-list">
              {subagents.length === 0 ? (
                <div className="kk-empty">No delegated workers</div>
              ) : (
                subagents.map((agent) => (
                  <article key={agent.id} className="kk-agent-row">
                    <Bot size={18} />
                    <div>
                      <strong>{agent.id}</strong>
                      <span>{agent.contract?.taskPreview ?? agent.lane ?? agent.phase}</span>
                    </div>
                    <span className={`kk-pill kk-pill-${agent.phase}`}>{agent.phase}</span>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <form className="kk-composer" onSubmit={submit}>
          <div className="kk-mode-switch" role="radiogroup" aria-label="Run mode">
            {(["interactive", "headless", "dry_run"] as const).map((item) => (
              <button
                key={item}
                type="button"
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
