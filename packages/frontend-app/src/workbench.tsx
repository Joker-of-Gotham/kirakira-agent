import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Command,
  CornerDownLeft,
  Clock3,
  Cpu,
  ExternalLink,
  FileSearch,
  GitBranch,
  ListTree,
  Play,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  TerminalSquare,
  Wrench,
  X,
} from "lucide-react";
import {
  createMcpDirectoryView,
  createMcpToolPlaygroundView,
  createEmptyRunDashboard,
  createRunActivityRailView,
  createRunInspector,
  createRunWorkstream,
  createSubagentTopologyView,
  createWorkbenchDetailViews,
  createWorkbenchNavigationView,
  createWorkbenchInspectorView,
  projectRunDashboard,
  runtimeTransportOrchestration,
  runtimeTransportSupportsArtifactContent,
  workbenchViewPresentation,
  type RuntimeArtifactContent,
  type RuntimeMcpDirectoryTool,
  type RuntimeMcpDirectoryView,
  type RuntimeMcpMetadataRow,
  type RuntimeMcpListResult,
  type RuntimeMcpToolCallResult,
  type RuntimeMcpToolPlaygroundView,
  type RunActivityRailMcpTool,
  type RunActivityRailSelection,
  type RunActivityRailView,
  type RunInspectorFocus,
  type RunInspectorLane,
  type RunInspectorProjection,
  type RunDashboardArtifact,
  type RunDashboardProjection,
  type RunDashboardResearchRun,
  type RunDashboardStatus,
  type RunWorkstreamActivity,
  type RunWorkstreamAttentionItem,
  type RunWorkstreamCard,
  type RunWorkstreamDetailDrawer,
  type RunWorkstreamProjection,
  type RuntimeConnectionState,
  type RuntimeTransport,
  type RuntimeTransportEvent,
  type RuntimeTransportStatus,
  type SubagentTopologyView,
  type WorkbenchInspectorView,
  type WorkbenchInspectorViewId,
  type WorkbenchArtifactDetailsView,
  type WorkbenchCitationLedgerView,
  type WorkbenchDetailChip,
  type WorkbenchDetailRow,
  type WorkbenchDetailViews,
  type WorkbenchSelectedSubagentDrawer,
  type WorkbenchViewId,
} from "@kirakira/frontend-core";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunEvent, RuntimeRunMode } from "@kirakira/runtime-contracts";
import {
  createWorkbenchCommandActions,
  filterWorkbenchCommandActions,
  type WorkbenchCommandAction,
} from "./command-actions.js";
import { createMockRuntimeTransport } from "./mock-transport.js";

export type KirakiraPresentationSurface = "web" | "desktop";
export type CommandPaletteOpenSubscription = (openCommandPalette: () => void) => () => void;

export interface KirakiraWorkbenchProps {
  transport?: RuntimeTransport;
  presentationSurface?: KirakiraPresentationSurface;
  productName?: string;
  environmentLabel?: string;
  initialPrompt?: string;
  commandPaletteOpenSubscription?: CommandPaletteOpenSubscription;
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

interface McpToolCallState {
  status: "idle" | "loading" | "ready" | "error";
  toolId?: string;
  result?: RuntimeMcpToolCallResult;
  message?: string;
}

type McpToolDetailTab = "details" | "run" | "schema";
type RunCommandAction = "steer" | "enqueue" | "provide_input" | "resume" | "inspect";
type RunCommandPriority = "normal" | "high";
type RunCommandStatusTone = "neutral" | "success" | "warning" | "critical";

interface RunCommandCenterState {
  targetRunId: string;
  steerInstruction: string;
  steerPriority: RunCommandPriority;
  enqueuePrompt: string;
  enqueuePriority: string;
  interruptId: string;
  inputJson: string;
  checkpointId: string;
  includeEvents: boolean;
}

interface RunCommandCenterStatus {
  tone: RunCommandStatusTone;
  message: string;
  detail?: string;
}

const defaultPrompt =
  "Port the runtime contract surface into a browser-safe UI and secure desktop bridge.";

const defaultCommandCenter: RunCommandCenterState = {
  targetRunId: "",
  steerInstruction: "Continue from the latest checkpoint and keep changes scoped.",
  steerPriority: "normal",
  enqueuePrompt: "",
  enqueuePriority: "",
  interruptId: "",
  inputJson: "{}",
  checkpointId: "",
  includeEvents: true,
};

const defaultCommandStatus: RunCommandCenterStatus = {
  tone: "neutral",
  message: "Command center ready",
};

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const summarizeRuntimeSnapshot = (state: unknown): string => {
  if (!isRecord(state)) return "Snapshot received";
  const status = textValue(state.status) ?? "unknown";
  const workers = Array.isArray(state.activeWorkers) ? state.activeWorkers.length : 0;
  const approvals = Array.isArray(state.pendingApprovals) ? state.pendingApprovals.length : 0;
  const checkpoint = textValue(state.checkpointId);
  return [
    `status ${status}`,
    `${workers} workers`,
    `${approvals} approvals`,
    checkpoint ? `checkpoint ${checkpoint}` : undefined,
  ]
    .filter(Boolean)
    .join(" / ");
};

export function KirakiraWorkbench({
  transport,
  presentationSurface = "web",
  productName = "Kirakira Agent",
  environmentLabel = "Local runtime",
  initialPrompt = defaultPrompt,
  commandPaletteOpenSubscription,
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
  const [mcpToolDrafts, setMcpToolDrafts] = useState<Record<string, string>>({});
  const [mcpToolCall, setMcpToolCall] = useState<McpToolCallState>({ status: "idle" });
  const [activeWorkbenchView, setActiveWorkbenchView] = useState<WorkbenchViewId>("runs");
  const [inspectorViewId, setInspectorViewId] = useState<WorkbenchInspectorViewId>("mcp");
  const [selectedCitationId, setSelectedCitationId] = useState<string | undefined>();
  const [isSubmitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [selectedFocusId, setSelectedFocusId] = useState<string | undefined>();
  const [selectedWorkstreamItemId, setSelectedWorkstreamItemId] = useState<string | undefined>();
  const [artifactPreviews, setArtifactPreviews] = useState<Record<string, ArtifactPreviewState>>(
    {},
  );
  const [commandCenter, setCommandCenter] =
    useState<RunCommandCenterState>(defaultCommandCenter);
  const [commandStatus, setCommandStatus] =
    useState<RunCommandCenterStatus>(defaultCommandStatus);
  const [commandBusy, setCommandBusy] = useState<RunCommandAction | undefined>();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const commandPaletteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const commandPaletteSearchRef = useRef<HTMLInputElement | null>(null);
  const commandPaletteWasOpenRef = useRef(false);
  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  useEffect(() => {
    if (!commandPaletteOpenSubscription) return undefined;
    return commandPaletteOpenSubscription(openCommandPalette);
  }, [commandPaletteOpenSubscription, openCommandPalette]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const composing = event.isComposing ||
        (event as KeyboardEvent & { keyCode?: number }).keyCode === 229;
      if (composing || event.repeat) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      openCommandPalette();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openCommandPalette]);

  useEffect(() => {
    if (commandPaletteOpen) {
      commandPaletteWasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => commandPaletteSearchRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    if (commandPaletteWasOpenRef.current) {
      commandPaletteWasOpenRef.current = false;
      commandPaletteTriggerRef.current?.focus();
    }
    return undefined;
  }, [commandPaletteOpen]);

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
    setMcpToolDrafts({});
    setMcpToolCall({ status: "idle" });
  }, [runtime]);

  const projection = useMemo(
    () => projectRunDashboard(createEmptyRunDashboard(runId), events, { latestEventLimit: 40 }),
    [events, runId],
  );
  const workstream = useMemo(
    () =>
      createRunWorkstream(projection, events, {
        selectedItemId: selectedWorkstreamItemId,
        maxActivityItems: 14,
      }),
    [events, projection, selectedWorkstreamItemId],
  );
  const inspector = useMemo(
    () => createRunInspector(projection, { selectedFocusId }),
    [projection, selectedFocusId],
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
  const selectedMcpToolDraft = selectedMcpTool
    ? mcpToolDrafts[selectedMcpTool.id] ?? selectedMcpTool.argumentDraft
    : "{}";
  const selectedMcpToolCallResult =
    selectedMcpTool && mcpToolCall.toolId === selectedMcpTool.id
      ? mcpToolCall.result
      : undefined;
  const selectedMcpPlayground = useMemo(
    () =>
      createMcpToolPlaygroundView(
        selectedMcpTool,
        selectedMcpToolDraft,
        selectedMcpToolCallResult,
      ),
    [selectedMcpTool, selectedMcpToolCallResult, selectedMcpToolDraft],
  );
  const workbenchInspector = useMemo(
    () =>
      createWorkbenchInspectorView({
        projection,
        runtimeStatus,
        mcpDirectory: mcpDirectoryView,
        mcpState: {
          status: mcpDirectory.status,
          ...(mcpDirectory.message ? { message: mcpDirectory.message } : {}),
        },
        activeView: inspectorViewId,
        selectedMcpToolId: selectedMcpTool?.id ?? selectedMcpToolId,
      }),
    [
      inspectorViewId,
      mcpDirectory.message,
      mcpDirectory.status,
      mcpDirectoryView,
      projection,
      runtimeStatus,
      selectedMcpTool?.id,
      selectedMcpToolId,
    ],
  );
  const activityRail = useMemo(
    () =>
      createRunActivityRailView({
        workstream,
        inspector,
        mcpPlayground: selectedMcpPlayground,
        maxActivityItems: 5,
      }),
    [inspector, selectedMcpPlayground, workstream],
  );
  const navigation = useMemo(
    () =>
      createWorkbenchNavigationView({
        projection,
        runtimeStatus,
        mcpDirectory: mcpDirectoryView,
        activeView: activeWorkbenchView,
      }),
    [activeWorkbenchView, mcpDirectoryView, projection, runtimeStatus],
  );
  const activeNavigation = navigation.items.find((item) => item.id === navigation.activeView);
  const activeNavigationLabel = activeNavigation?.label ?? "Runtime";
  const activeNavigationSelector = activeNavigation?.selector ?? "workbench-view-runtime";

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

  useEffect(() => {
    if (!runId) return;
    setCommandCenter((state) => ({ ...state, targetRunId: runId }));
    setCommandStatus({
      tone: "neutral",
      message: "Active run selected",
      detail: runId,
    });
  }, [runId]);

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
      setSelectedWorkstreamItemId(undefined);
      setSelectedCitationId(undefined);
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

  const commandTargetRunId = commandCenter.targetRunId.trim() || runId;

  const updateCommandDraft = useCallback(
    <K extends keyof RunCommandCenterState>(key: K, value: RunCommandCenterState[K]) => {
      setCommandCenter((state) => ({ ...state, [key]: value }));
    },
    [],
  );

  const runControlCommand = async (
    action: RunCommandAction,
    execute: () => Promise<string | undefined>,
    successMessage: string,
  ) => {
    setCommandBusy(action);
    setError(undefined);
    try {
      const detail = await execute();
      setCommandStatus({
        tone: "success",
        message: successMessage,
        ...(detail ? { detail } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCommandStatus({ tone: "critical", message: "Command failed", detail: message });
      setConnection("degraded");
      setError(message);
    } finally {
      setCommandBusy(undefined);
    }
  };

  const steerRun = () =>
    runControlCommand(
      "steer",
      async () => {
        if (!commandTargetRunId) throw new Error("Run ID is required");
        const instruction = commandCenter.steerInstruction.trim();
        if (!instruction) throw new Error("Steer instruction is required");
        await runtime.steer({
          runId: commandTargetRunId,
          instruction,
          priority: commandCenter.steerPriority,
        });
        return commandTargetRunId;
      },
      "Steer sent",
    );

  const enqueuePrompt = () =>
    runControlCommand(
      "enqueue",
      async () => {
        const queuedPrompt = commandCenter.enqueuePrompt.trim();
        if (!queuedPrompt) throw new Error("Queue prompt is required");
        const priorityText = commandCenter.enqueuePriority.trim();
        const priority = priorityText.length > 0 ? Number(priorityText) : undefined;
        if (priorityText.length > 0 && (priority === undefined || Number.isNaN(priority))) {
          throw new Error("Queue priority must be numeric");
        }
        await runtime.enqueue({
          prompt: queuedPrompt,
          ...(priority !== undefined ? { priority } : {}),
          ...(commandTargetRunId ? { runId: commandTargetRunId } : {}),
        });
        setCommandCenter((state) => ({ ...state, enqueuePrompt: "" }));
        return commandTargetRunId;
      },
      "Prompt queued",
    );

  const provideRunInput = () =>
    runControlCommand(
      "provide_input",
      async () => {
        if (!commandTargetRunId) throw new Error("Run ID is required");
        const interruptId = commandCenter.interruptId.trim();
        if (!interruptId) throw new Error("Interrupt ID is required");
        const text = commandCenter.inputJson.trim();
        const data = text.length > 0 ? JSON.parse(text) : {};
        await runtime.provideInput({ runId: commandTargetRunId, interruptId, data });
        return interruptId;
      },
      "Input provided",
    );

  const resumeRun = () =>
    runControlCommand(
      "resume",
      async () => {
        if (!commandTargetRunId) throw new Error("Run ID is required");
        const fromCheckpoint = commandCenter.checkpointId.trim();
        await runtime.resume({
          runId: commandTargetRunId,
          ...(fromCheckpoint ? { fromCheckpoint } : {}),
        });
        return fromCheckpoint || commandTargetRunId;
      },
      "Run resumed",
    );

  const inspectRun = () =>
    runControlCommand(
      "inspect",
      async () => {
        if (!commandTargetRunId) throw new Error("Run ID is required");
        const snapshot = await runtime.inspect({
          runId: commandTargetRunId,
          includeEvents: commandCenter.includeEvents,
        });
        return summarizeRuntimeSnapshot(snapshot.state);
      },
      "Snapshot received",
    );

  const selectWorkstreamItem = useCallback((itemId: string, focusId?: string) => {
    setSelectedWorkstreamItemId(itemId);
    if (focusId) setSelectedFocusId(focusId);
  }, []);

  const selectWorkbenchView = useCallback((viewId: WorkbenchViewId) => {
    setActiveWorkbenchView(viewId);
    if (viewId === "research") setInspectorViewId("research");
    if (viewId === "systems") setInspectorViewId("mcp");
  }, []);

  const updateMcpArgumentDraft = useCallback((toolId: string, draft: string) => {
    setMcpToolDrafts((drafts) => ({ ...drafts, [toolId]: draft }));
  }, []);

  const topologyManifest = runtimeTransportOrchestration(runtimeStatus);
  const topology = useMemo(
    () => createSubagentTopologyView(projection, topologyManifest),
    [projection, topologyManifest],
  );

  useEffect(() => {
    if (!selectedMcpTool) return;
    setMcpToolDrafts((drafts) =>
      drafts[selectedMcpTool.id] === undefined
        ? { ...drafts, [selectedMcpTool.id]: selectedMcpTool.argumentDraft }
        : drafts,
    );
    setMcpToolCall((state) =>
      state.toolId === undefined || state.toolId === selectedMcpTool.id
        ? state
        : { status: "idle" },
    );
  }, [selectedMcpTool]);

  const callSelectedMcpTool = useCallback(async () => {
    if (!selectedMcpTool) return;
    if (selectedMcpPlayground.draft.status !== "ready") {
      setMcpToolCall({
        status: "error",
        toolId: selectedMcpTool.id,
        message: selectedMcpPlayground.draft.error ?? "MCP arguments must be a JSON object",
      });
      return;
    }

    setMcpToolCall({ status: "loading", toolId: selectedMcpTool.id });
    try {
      const result = await runtime.callMcpTool({
        server: selectedMcpTool.server,
        tool: selectedMcpTool.name,
        arguments: selectedMcpPlayground.draft.arguments ?? {},
        ...(runId ? { runId } : {}),
      });
      setMcpToolCall({ status: "ready", toolId: selectedMcpTool.id, result });
    } catch (err) {
      setMcpToolCall({
        status: "error",
        toolId: selectedMcpTool.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [runId, runtime, selectedMcpPlayground.draft, selectedMcpTool]);

  const researchRuns = Object.values(projection.researchRuns);
  const latestResearch = researchRuns[researchRuns.length - 1];
  const artifacts = Object.values(projection.artifactDetails).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const selectedSubagentId = selectedFocusId?.startsWith("subagent:")
    ? selectedFocusId.replace(/^subagent:/, "")
    : undefined;
  const selectedArtifactId = selectedFocusId?.startsWith("artifact:")
    ? selectedFocusId.replace(/^artifact:/, "")
    : undefined;
  const detailViews = useMemo(
    () =>
      createWorkbenchDetailViews({
        projection,
        selectedSubagentId,
        selectedCitationId,
        selectedArtifactId,
      }),
    [projection, selectedArtifactId, selectedCitationId, selectedSubagentId],
  );
  const activeArtifactId = detailViews.artifactDetails.selected?.id;
  const selectedArtifactPreviewKey =
    runId && activeArtifactId ? `${runId}:${activeArtifactId}` : undefined;
  const selectedArtifactPreview = selectedArtifactPreviewKey
    ? artifactPreviews[selectedArtifactPreviewKey]
    : undefined;
  const artifactContentCapabilityKnown = runtimeStatus !== undefined;
  const artifactContentAvailable = runtimeTransportSupportsArtifactContent(runtimeStatus);
  const selectedArtifactPreviewDisplay = selectedArtifactPreview ??
    (activeArtifactId && artifactContentCapabilityKnown && !artifactContentAvailable
      ? {
          artifactId: activeArtifactId,
          status: "error" as const,
          message: "Artifact preview is not enabled by this runtime",
        }
      : undefined);
  const pendingApproval = projection.pendingApprovalIds[0];
  const workbenchCommandActions = useMemo(
    () =>
      createWorkbenchCommandActions({
        runId: commandTargetRunId,
        activeView: navigation.activeView,
        views: navigation.items.map((item) => ({
          id: item.id,
          label: item.label,
          status: item.status,
          selected: item.selected,
        })),
        attention: workstream.attention,
        pendingApprovalId: pendingApproval,
        activeArtifactId,
        activeArtifactTitle: detailViews.artifactDetails.selected?.title,
        selectedMcpTool,
        commandBusy: commandBusy !== undefined || mcpToolCall.status === "loading",
        drafts: {
          steerInstruction: commandCenter.steerInstruction,
          enqueuePrompt: commandCenter.enqueuePrompt,
          interruptId: commandCenter.interruptId,
        },
      }),
    [
      activeArtifactId,
      commandBusy,
      commandCenter.enqueuePrompt,
      commandCenter.interruptId,
      commandCenter.steerInstruction,
      commandTargetRunId,
      detailViews.artifactDetails.selected?.title,
      mcpToolCall.status,
      navigation.activeView,
      navigation.items,
      pendingApproval,
      selectedMcpTool,
      workstream.attention,
    ],
  );
  const executeWorkbenchCommand = useCallback(
    (action: WorkbenchCommandAction) => {
      if (action.disabled) return;
      setCommandPaletteOpen(false);
      setCommandPaletteQuery("");
      if (action.kind === "steer_run") {
        void steerRun();
        return;
      }
      if (action.kind === "enqueue_prompt") {
        void enqueuePrompt();
        return;
      }
      if (action.kind === "provide_input") {
        void provideRunInput();
        return;
      }
      if (action.kind === "resume_run") {
        void resumeRun();
        return;
      }
      if (action.kind === "inspect_run") {
        void inspectRun();
        return;
      }
      if (action.kind === "open_view" && action.viewId) {
        selectWorkbenchView(action.viewId);
        return;
      }
      if (action.kind === "open_attention") {
        selectWorkbenchView("runs");
        if (action.targetId) selectWorkstreamItem(action.targetId, action.focusId);
        else if (action.focusId) setSelectedFocusId(action.focusId);
        return;
      }
      if (action.kind === "open_approval") {
        selectWorkbenchView("runs");
        if (action.targetId) selectWorkstreamItem(action.targetId, action.focusId);
        return;
      }
      if (action.kind === "approve_gate") {
        void approve("approve");
        return;
      }
      if (action.kind === "open_artifact") {
        selectWorkbenchView("research");
        if (action.focusId) setSelectedFocusId(action.focusId);
        return;
      }
      if (action.kind === "open_mcp_tool") {
        selectWorkbenchView("systems");
        setInspectorViewId("mcp");
        if (action.targetId) setSelectedMcpToolId(action.targetId);
        return;
      }
      if (action.kind === "call_mcp_tool") {
        selectWorkbenchView("systems");
        setInspectorViewId("mcp");
        if (action.targetId) setSelectedMcpToolId(action.targetId);
        void callSelectedMcpTool();
      }
    },
    [
      approve,
      callSelectedMcpTool,
      enqueuePrompt,
      inspectRun,
      provideRunInput,
      resumeRun,
      selectWorkbenchView,
      selectWorkstreamItem,
      steerRun,
    ],
  );
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
    if (!runId || !activeArtifactId || !selectedArtifactPreviewKey) return;
    if (!artifactContentAvailable) return;
    const existing = artifactPreviews[selectedArtifactPreviewKey];
    if (existing) return;
    let disposed = false;
    setArtifactPreviews((items) => ({
      ...items,
      [selectedArtifactPreviewKey]: {
        artifactId: activeArtifactId,
        status: "loading",
      },
    }));
    runtime
      .getArtifactContent({ runId, artifactId: activeArtifactId })
      .then((content) => {
        if (disposed) return;
        setArtifactPreviews((items) => ({
          ...items,
          [selectedArtifactPreviewKey]: {
            artifactId: activeArtifactId,
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
            artifactId: activeArtifactId,
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
    activeArtifactId,
    runId,
    runtime,
    selectedArtifactPreviewKey,
  ]);

  return (
    <main
      className="kk-shell"
      data-kk-presentation-surface={presentationSurface}
      data-kk-workbench-view={activeNavigationSelector}
    >
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
          {navigation.items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.selected ? "page" : undefined}
              aria-label={item.navAriaLabel}
              data-kk-workbench-view={item.selector}
              className={
                item.selected
                  ? `kk-nav-item kk-nav-item-active kk-nav-item-${item.tone}`
                  : `kk-nav-item kk-nav-item-${item.tone}`
              }
              onClick={() => selectWorkbenchView(item.id)}
            >
              <WorkbenchNavIcon id={item.id} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.status}</small>
              </span>
              <em>{item.count}</em>
            </button>
          ))}
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
            <p className="kk-kicker">{activeNavigationLabel} workbench</p>
            <h1>{projection.runId ?? "Ready for a run"}</h1>
          </div>
          <div className="kk-topbar-actions">
            <button
              ref={commandPaletteTriggerRef}
              type="button"
              className="kk-command-trigger"
              aria-label="Open command palette"
              aria-haspopup="dialog"
              aria-expanded={commandPaletteOpen}
              onClick={() => setCommandPaletteOpen(true)}
            >
              <Command size={16} />
              <span>Commands</span>
              <kbd className="kk-command-shortcut" aria-hidden="true">Ctrl K</kbd>
            </button>
            <div className={`kk-connection kk-connection-${connection}`}>
              <CircleDot size={16} />
              {connection}
            </div>
          </div>
        </header>

        <section className="kk-stats" aria-label="Run summary">
          <Stat label="Status" value={statusLabel[projection.status]} icon={<Cpu size={18} />} />
          <Stat label="Events" value={String(events.length)} icon={<GitBranch size={18} />} />
          <Stat label="Entities" value={String(countEntities(projection))} icon={<Bot size={18} />} />
          <Stat label="Updated" value={formatClock(projection.updatedAt)} icon={<Clock3 size={18} />} />
        </section>

        <RunCommandCenter
          state={commandCenter}
          status={commandStatus}
          busy={commandBusy}
          hasActiveRun={Boolean(commandTargetRunId)}
          onDraftChange={updateCommandDraft}
          onSteer={() => void steerRun()}
          onEnqueue={() => void enqueuePrompt()}
          onProvideInput={() => void provideRunInput()}
          onResume={() => void resumeRun()}
          onInspect={() => void inspectRun()}
        />

        <WorkbenchViewSurface
          activeView={navigation.activeView}
          workstream={workstream}
          topology={topology}
          researchRuns={researchRuns}
          artifacts={artifacts}
          detailViews={detailViews}
          artifactPreview={selectedArtifactPreviewDisplay}
          systemInspector={workbenchInspector}
          mcpState={mcpDirectory}
          mcpDirectoryView={mcpDirectoryView}
          selectedMcpTool={selectedMcpTool}
          selectedMcpToolId={selectedMcpTool?.id}
          selectedMcpPlayground={selectedMcpPlayground}
          mcpToolDetail={activityRail.mcpTool}
          mcpToolCall={mcpToolCall}
          onCancel={cancel}
          canCancel={Boolean(runId)}
          onSelectItem={selectWorkstreamItem}
          onSelectFocus={setSelectedFocusId}
          onSelectArtifact={(id) => setSelectedFocusId(`artifact:${id}`)}
          onSelectCitation={setSelectedCitationId}
          onInspectorViewChange={setInspectorViewId}
          onSelectMcpTool={setSelectedMcpToolId}
          onMcpArgumentDraftChange={updateMcpArgumentDraft}
          onCallMcpTool={() => void callSelectedMcpTool()}
          onRefreshMcp={() => void refreshMcpDirectory(false)}
          onStartAndRefreshMcp={() => void refreshMcpDirectory(true)}
        />

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
        {navigation.activeView !== "systems" ? (
          <SystemInspectorPanel
            view={workbenchInspector}
            onViewChange={setInspectorViewId}
            onSelectFocus={setSelectedFocusId}
            onSelectMcpTool={setSelectedMcpToolId}
          />
        ) : null}

        <ActivityRailPanel
          view={activityRail}
          onSelectItem={selectWorkstreamItem}
          onSelectFocus={setSelectedFocusId}
        />

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

        {navigation.activeView !== "research" ? (
          <OutputArtifactsPanel
            artifacts={artifacts}
            onSelectArtifact={(id) => setSelectedFocusId(`artifact:${id}`)}
          />
        ) : null}

        {navigation.activeView !== "research" ? (
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
        ) : null}

        {navigation.activeView !== "systems" ? (
          <McpDirectoryPanel
            state={mcpDirectory}
            view={mcpDirectoryView}
            selectedTool={selectedMcpTool}
            selectedToolId={selectedMcpTool?.id}
            playground={selectedMcpPlayground}
            toolDetail={activityRail.mcpTool}
            callState={mcpToolCall}
            onSelectTool={setSelectedMcpToolId}
            onArgumentDraftChange={updateMcpArgumentDraft}
            onCallTool={() => void callSelectedMcpTool()}
            onRefresh={() => void refreshMcpDirectory(false)}
            onStartAndRefresh={() => void refreshMcpDirectory(true)}
          />
        ) : null}

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

      <WorkbenchCommandPalette
        open={commandPaletteOpen}
        actions={workbenchCommandActions}
        query={commandPaletteQuery}
        searchRef={commandPaletteSearchRef}
        onQueryChange={setCommandPaletteQuery}
        onClose={() => setCommandPaletteOpen(false)}
        onExecute={executeWorkbenchCommand}
      />
    </main>
  );
}

function WorkbenchCommandPalette({
  open,
  actions,
  query,
  searchRef,
  onQueryChange,
  onClose,
  onExecute,
}: {
  open: boolean;
  actions: readonly WorkbenchCommandAction[];
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onExecute: (action: WorkbenchCommandAction) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const filteredActions = useMemo(
    () => filterWorkbenchCommandActions(actions, query),
    [actions, query],
  );
  const groupedActions = useMemo(() => {
    const groups = new Map<string, WorkbenchCommandAction[]>();
    for (const action of filteredActions) {
      const items = groups.get(action.group) ?? [];
      items.push(action);
      groups.set(action.group, items);
    }
    return [...groups.entries()];
  }, [filteredActions]);
  const firstEnabledAction = filteredActions.find((action) => !action.disabled);

  if (!open) return null;

  const focusResult = (direction: 1 | -1, currentIndex?: number) => {
    const enabledRefs = resultRefs.current
      .map((element, index) => ({ element, index }))
      .filter((item) => item.element && !item.element.disabled);
    if (enabledRefs.length === 0) return;
    if (currentIndex === undefined) {
      enabledRefs[0]?.element?.focus();
      return;
    }
    const position = enabledRefs.findIndex((item) => item.index === currentIndex);
    const nextPosition = position === -1
      ? 0
      : (position + direction + enabledRefs.length) % enabledRefs.length;
    enabledRefs[nextPosition]?.element?.focus();
  };

  const trapDialogFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  resultRefs.current = [];
  let optionCursor = 0;

  return (
    <div
      className="kk-command-palette-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={panelRef}
        className="kk-command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kk-command-palette-title"
        data-kk-command-palette="open"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          trapDialogFocus(event);
        }}
      >
        <header className="kk-command-palette-head">
          <div>
            <p className="kk-kicker">Command Layer</p>
            <h2 id="kk-command-palette-title">Workbench Commands</h2>
          </div>
          <button type="button" className="kk-icon-button" aria-label="Close command palette" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <label className="kk-command-search-label" htmlFor="kk-command-query">
          <Search size={17} />
          <input
            ref={searchRef}
            id="kk-command-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label="Search workbench commands"
            onKeyDown={(event) => {
              if (event.key === "Enter" && firstEnabledAction) {
                event.preventDefault();
                onExecute(firstEnabledAction);
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusResult(1);
              }
            }}
            placeholder="Search runs, gates, artifacts, MCP tools"
            autoComplete="off"
          />
        </label>
        <div className="kk-command-results" aria-label="Workbench command results">
          {groupedActions.length === 0 ? (
            <div className="kk-command-empty">No matching commands</div>
          ) : (
            groupedActions.map(([group, groupActions]) => (
              <section key={group} className="kk-command-group" aria-label={group}>
                <h3>{group}</h3>
                <div>
                  {groupActions.map((action) => {
                    const optionIndex = optionCursor;
                    optionCursor += 1;
                    return (
                      <button
                        key={action.id}
                        ref={(element) => {
                          resultRefs.current[optionIndex] = element;
                        }}
                        type="button"
                        className={`kk-command-option kk-command-option-${action.tone}`}
                        disabled={action.disabled}
                        title={action.disabledReason}
                        data-kk-command-action-id={action.id}
                        data-kk-command-action-kind={action.kind}
                        onClick={() => onExecute(action)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            focusResult(1, optionIndex);
                          }
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            if (optionIndex === 0) searchRef.current?.focus();
                            else focusResult(-1, optionIndex);
                          }
                        }}
                      >
                        <span className="kk-command-option-copy">
                          <strong>{action.label}</strong>
                          <small>{action.disabledReason ?? action.detail ?? action.id}</small>
                        </span>
                        <span className="kk-command-option-status">
                          {action.disabled ? <Square size={14} /> : <CornerDownLeft size={15} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function WorkbenchNavIcon({ id }: { id: WorkbenchViewId }) {
  if (id === "agents") return <Bot size={18} />;
  if (id === "research") return <FileSearch size={18} />;
  if (id === "systems") return <ShieldCheck size={18} />;
  return <Activity size={18} />;
}

function RunCommandCenter({
  state,
  status,
  busy,
  hasActiveRun,
  onDraftChange,
  onSteer,
  onEnqueue,
  onProvideInput,
  onResume,
  onInspect,
}: {
  state: RunCommandCenterState;
  status: RunCommandCenterStatus;
  busy?: RunCommandAction;
  hasActiveRun: boolean;
  onDraftChange: <K extends keyof RunCommandCenterState>(
    key: K,
    value: RunCommandCenterState[K],
  ) => void;
  onSteer: () => void;
  onEnqueue: () => void;
  onProvideInput: () => void;
  onResume: () => void;
  onInspect: () => void;
}) {
  const busyLabel = busy ? busy.replace("_", " ") : undefined;
  const controlsDisabled = busy !== undefined;
  const canSteer = hasActiveRun && state.steerInstruction.trim().length > 0;
  const canEnqueue = state.enqueuePrompt.trim().length > 0;
  const canProvideInput = hasActiveRun && state.interruptId.trim().length > 0;
  const canResumeOrInspect = hasActiveRun;

  return (
    <section
      className={`kk-command-center kk-command-center-${status.tone}`}
      aria-label="Run command center"
    >
      <div className="kk-command-head">
        <div>
          <p className="kk-kicker">Control</p>
          <h2>Run Command Center</h2>
        </div>
        <div
          className={`kk-command-status kk-command-status-${status.tone}`}
          role="status"
          aria-live="polite"
        >
          <CircleDot size={15} />
          <span>
            <strong>{busyLabel ? `Running ${busyLabel}` : status.message}</strong>
            {status.detail ? <small>{status.detail}</small> : null}
          </span>
        </div>
      </div>

      <div className="kk-command-grid">
        <label className="kk-command-field kk-command-field-run">
          <span>Run ID</span>
          <input
            value={state.targetRunId}
            onChange={(event) => onDraftChange("targetRunId", event.target.value)}
          />
        </label>

        <div className="kk-command-block kk-command-block-steer">
          <label className="kk-command-field">
            <span>Steer</span>
            <textarea
              rows={2}
              value={state.steerInstruction}
              onChange={(event) => onDraftChange("steerInstruction", event.target.value)}
            />
          </label>
          <div className="kk-command-actions">
            <div className="kk-command-priority" role="group" aria-label="Steer priority">
              {(["normal", "high"] as const).map((priority) => (
                <button
                  key={priority}
                  type="button"
                  aria-pressed={state.steerPriority === priority}
                  className={state.steerPriority === priority ? "kk-command-priority-active" : ""}
                  onClick={() => onDraftChange("steerPriority", priority)}
                >
                  {priority}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="kk-icon-button"
              onClick={onSteer}
              disabled={controlsDisabled || !canSteer}
            >
              <TerminalSquare size={15} />
              <span>Steer</span>
            </button>
          </div>
        </div>

        <div className="kk-command-block kk-command-block-queue">
          <label className="kk-command-field">
            <span>Queue Prompt</span>
            <textarea
              rows={2}
              value={state.enqueuePrompt}
              onChange={(event) => onDraftChange("enqueuePrompt", event.target.value)}
            />
          </label>
          <div className="kk-command-actions">
            <label className="kk-command-field kk-command-priority-input">
              <span>Priority</span>
              <input
                inputMode="numeric"
                value={state.enqueuePriority}
                onChange={(event) => onDraftChange("enqueuePriority", event.target.value)}
              />
            </label>
            <button
              type="button"
              className="kk-icon-button"
              onClick={onEnqueue}
              disabled={controlsDisabled || !canEnqueue}
            >
              <Play size={15} />
              <span>Enqueue</span>
            </button>
          </div>
        </div>

        <div className="kk-command-block kk-command-block-input">
          <label className="kk-command-field kk-command-interrupt">
            <span>Interrupt</span>
            <input
              value={state.interruptId}
              onChange={(event) => onDraftChange("interruptId", event.target.value)}
            />
          </label>
          <label className="kk-command-field">
            <span>Input JSON</span>
            <textarea
              rows={2}
              value={state.inputJson}
              spellCheck={false}
              onChange={(event) => onDraftChange("inputJson", event.target.value)}
            />
          </label>
          <button
            type="button"
            className="kk-icon-button"
            onClick={onProvideInput}
            disabled={controlsDisabled || !canProvideInput}
          >
            <CheckCircle2 size={15} />
            <span>Provide</span>
          </button>
        </div>

        <div className="kk-command-block kk-command-block-resume">
          <label className="kk-command-field">
            <span>Checkpoint</span>
            <input
              value={state.checkpointId}
              onChange={(event) => onDraftChange("checkpointId", event.target.value)}
            />
          </label>
          <label className="kk-command-toggle">
            <input
              type="checkbox"
              checked={state.includeEvents}
              onChange={(event) => onDraftChange("includeEvents", event.target.checked)}
            />
            <span>Events</span>
          </label>
          <div className="kk-command-actions kk-command-actions-split">
            <button
              type="button"
              className="kk-icon-button"
              onClick={onResume}
              disabled={controlsDisabled || !canResumeOrInspect}
            >
              <RefreshCw size={15} />
              <span>Resume</span>
            </button>
            <button
              type="button"
              className="kk-icon-button"
              onClick={onInspect}
              disabled={controlsDisabled || !canResumeOrInspect}
            >
              <ListTree size={15} />
              <span>Inspect</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkbenchViewSurface({
  activeView,
  workstream,
  topology,
  researchRuns,
  artifacts,
  detailViews,
  artifactPreview,
  systemInspector,
  mcpState,
  mcpDirectoryView,
  selectedMcpTool,
  selectedMcpToolId,
  selectedMcpPlayground,
  mcpToolDetail,
  mcpToolCall,
  onCancel,
  canCancel,
  onSelectItem,
  onSelectFocus,
  onSelectArtifact,
  onSelectCitation,
  onInspectorViewChange,
  onSelectMcpTool,
  onMcpArgumentDraftChange,
  onCallMcpTool,
  onRefreshMcp,
  onStartAndRefreshMcp,
}: {
  activeView: WorkbenchViewId;
  workstream: RunWorkstreamProjection;
  topology: SubagentTopologyView;
  researchRuns: RunDashboardResearchRun[];
  artifacts: RunDashboardArtifact[];
  detailViews: WorkbenchDetailViews;
  artifactPreview?: ArtifactPreviewState;
  systemInspector: WorkbenchInspectorView;
  mcpState: McpDirectoryState;
  mcpDirectoryView: RuntimeMcpDirectoryView;
  selectedMcpTool?: RuntimeMcpDirectoryTool;
  selectedMcpToolId?: string;
  selectedMcpPlayground: RuntimeMcpToolPlaygroundView;
  mcpToolDetail?: RunActivityRailMcpTool;
  mcpToolCall: McpToolCallState;
  onCancel: () => void;
  canCancel: boolean;
  onSelectItem: (itemId: string, focusId?: string) => void;
  onSelectFocus: (id: string) => void;
  onSelectArtifact: (id: string) => void;
  onSelectCitation: (id: string) => void;
  onInspectorViewChange: (id: WorkbenchInspectorViewId) => void;
  onSelectMcpTool: (id: string) => void;
  onMcpArgumentDraftChange: (toolId: string, draft: string) => void;
  onCallMcpTool: () => void;
  onRefreshMcp: () => void;
  onStartAndRefreshMcp: () => void;
}) {
  const presentation = workbenchViewPresentation(activeView);

  if (activeView === "agents") {
    return (
      <section
        className="kk-main-grid kk-view-grid kk-view-agents"
        aria-label={presentation.workspaceAriaLabel}
        data-kk-workbench-view={presentation.selector}
      >
        <SwarmTopologyPanel topology={topology} onSelectFocus={onSelectFocus} />
        <AgentOperationsPanel
          topology={topology}
          workstream={workstream}
          subagentDrawer={detailViews.subagentDrawer}
          onSelectFocus={onSelectFocus}
          onSelectItem={onSelectItem}
        />
      </section>
    );
  }

  if (activeView === "research") {
    return (
      <section
        className="kk-main-grid kk-view-grid kk-view-research"
        aria-label={presentation.workspaceAriaLabel}
        data-kk-workbench-view={presentation.selector}
      >
        <ResearchWorkspacePanel
          researchRuns={researchRuns}
          artifacts={artifacts}
          citationLedger={detailViews.citationLedger}
          onSelectFocus={onSelectFocus}
          onSelectCitation={onSelectCitation}
        />
        <ArtifactDetailsPanel
          view={detailViews.artifactDetails}
          artifactPreview={artifactPreview}
          onSelectArtifact={onSelectArtifact}
        />
      </section>
    );
  }

  if (activeView === "systems") {
    return (
      <section
        className="kk-main-grid kk-view-grid kk-view-systems"
        aria-label={presentation.workspaceAriaLabel}
        data-kk-workbench-view={presentation.selector}
      >
        <SystemInspectorPanel
          view={systemInspector}
          onViewChange={onInspectorViewChange}
          onSelectFocus={onSelectFocus}
          onSelectMcpTool={onSelectMcpTool}
        />
        <McpDirectoryPanel
          state={mcpState}
          view={mcpDirectoryView}
          selectedTool={selectedMcpTool}
          selectedToolId={selectedMcpToolId}
          playground={selectedMcpPlayground}
          toolDetail={mcpToolDetail}
          callState={mcpToolCall}
          onSelectTool={onSelectMcpTool}
          onArgumentDraftChange={onMcpArgumentDraftChange}
          onCallTool={onCallMcpTool}
          onRefresh={onRefreshMcp}
          onStartAndRefresh={onStartAndRefreshMcp}
        />
      </section>
    );
  }

  return (
    <section
      className="kk-main-grid kk-view-grid kk-view-runs"
      aria-label={presentation.workspaceAriaLabel}
      data-kk-workbench-view={presentation.selector}
    >
      <RunWorkstreamPanel
        workstream={workstream}
        onCancel={onCancel}
        canCancel={canCancel}
        onSelectItem={onSelectItem}
      />
      <SwarmTopologyPanel topology={topology} onSelectFocus={onSelectFocus} />
    </section>
  );
}

function AgentOperationsPanel({
  topology,
  workstream,
  subagentDrawer,
  onSelectFocus,
  onSelectItem,
}: {
  topology: SubagentTopologyView;
  workstream: RunWorkstreamProjection;
  subagentDrawer: WorkbenchSelectedSubagentDrawer;
  onSelectFocus: (id: string) => void;
  onSelectItem: (itemId: string, focusId?: string) => void;
}) {
  const roles = topology.roles.slice(0, 6);
  const liveWorkers = topology.roles.flatMap((role) => role.workers).slice(0, 6);
  return (
    <section className="kk-agent-ops-panel" aria-label="Agent operations">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Agents</p>
          <h2>Swarm Control</h2>
        </div>
        <span className="kk-count">{topology.summary.handoffMode ?? "single"}</span>
      </div>

      <dl className="kk-ops-metrics">
        <div>
          <dt>Roles</dt>
          <dd>{topology.summary.roleCount}</dd>
        </div>
        <div>
          <dt>Workers</dt>
          <dd>{topology.summary.activeWorkerCount}/{topology.summary.workerCount}</dd>
        </div>
        <div className={topology.summary.mismatchCount > 0 ? "kk-ops-warning" : ""}>
          <dt>Lane drift</dt>
          <dd>{topology.summary.mismatchCount}</dd>
        </div>
      </dl>

      <div className="kk-agent-ops-grid">
        <section aria-label="Role readiness">
          <div className="kk-section-heading">
            <span>Role readiness</span>
            <span>{roles.length}</span>
          </div>
          <div className="kk-agent-role-list">
            {roles.length === 0 ? (
              <div className="kk-empty">No roles published</div>
            ) : (
              roles.map((role) => (
                <article key={role.id} className="kk-agent-role-row">
                  <header>
                    <span className={`kk-dot kk-dot-${role.phase}`} />
                    <span>
                      <strong>{role.label}</strong>
                      <small>{role.description ?? role.sources.join(" / ")}</small>
                    </span>
                    <span>{role.activeWorkerCount}/{role.workerCount}</span>
                  </header>
                  <div>
                    {role.capabilityLabels.slice(0, 4).map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section aria-label="Live workers">
          <div className="kk-section-heading">
            <span>Live workers</span>
            <span>{liveWorkers.length}</span>
          </div>
          <div className="kk-agent-worker-list">
            {liveWorkers.length === 0 ? (
              <div className="kk-empty">No workers active</div>
            ) : (
              liveWorkers.map((worker) => (
                <button
                  key={worker.id}
                  type="button"
                  className={
                    subagentDrawer.selected?.id === worker.id
                      ? "kk-agent-worker-row kk-agent-worker-row-active"
                      : "kk-agent-worker-row"
                  }
                  aria-pressed={subagentDrawer.selected?.id === worker.id}
                  onClick={() => onSelectFocus(`subagent:${worker.id}`)}
                >
                  <span className={`kk-dot kk-dot-${worker.phase}`} />
                  <span>
                    <strong>{worker.id}</strong>
                    <small>{worker.taskPreview ?? worker.role ?? worker.phase}</small>
                  </span>
                  <span>{worker.phase}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <SelectedSubagentDrawer drawer={subagentDrawer} onSelectFocus={onSelectFocus} />

      <section aria-label="Agent attention">
        <div className="kk-section-heading">
          <span>Attention queue</span>
          <span>{workstream.attention.length}</span>
        </div>
        <div className="kk-agent-attention-list">
          {workstream.attention.length === 0 ? (
            <div className="kk-empty">No agent attention required</div>
          ) : (
            workstream.attention.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`kk-agent-attention-row kk-attention-${item.severity}`}
                onClick={() => onSelectItem(item.id, item.focusId)}
              >
                <AlertTriangle size={15} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.actionLabel}</small>
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

function SelectedSubagentDrawer({
  drawer,
  onSelectFocus,
}: {
  drawer: WorkbenchSelectedSubagentDrawer;
  onSelectFocus: (id: string) => void;
}) {
  const selected = drawer.selected;
  return (
    <section className="kk-selected-drawer" aria-label="Selected subagent detail">
      <div className="kk-section-heading">
        <span>Selected subagent</span>
        <span>{drawer.candidates.length}</span>
      </div>

      {drawer.candidates.length > 1 ? (
        <div className="kk-subagent-picker" aria-label="Subagent detail selector">
          {drawer.candidates.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.selected
                  ? `kk-subagent-pick kk-subagent-pick-active kk-subagent-pick-${item.tone}`
                  : `kk-subagent-pick kk-subagent-pick-${item.tone}`
              }
              aria-pressed={item.selected}
              onClick={() => onSelectFocus(item.focusId)}
            >
              <span className={`kk-dot kk-dot-${item.phase}`} />
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!selected ? (
        <div className="kk-empty">{drawer.emptyMessage ?? "No selected subagent"}</div>
      ) : (
        <article className={`kk-selected-detail kk-selected-detail-${selected.tone}`}>
          <header>
            <span className={`kk-pill kk-pill-${selected.phase}`}>{selected.phase}</span>
            <h3>{selected.title}</h3>
            <p>{selected.summary}</p>
          </header>

          <dl className="kk-mini-metrics">
            {selected.metrics.map((metric) => (
              <div key={`${selected.id}-${metric.label}`} className={`kk-mini-metric-${metric.tone}`}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>

          <DetailRows rows={selected.rows} />

          {selected.capabilities.length > 0 ? (
            <div className="kk-chip-strip" aria-label="Subagent capabilities">
              {selected.capabilities.map((chip) => (
                <span key={chip.label} className={`kk-chip kk-chip-${chip.tone}`}>
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}

          {selected.artifactRefs.length > 0 ? (
            <div className="kk-artifact-ref-list" aria-label="Subagent artifact references">
              {selected.artifactRefs.map((ref) =>
                ref.focusId ? (
                  <button
                    key={`${ref.source}-${ref.id}`}
                    type="button"
                    className={`kk-artifact-ref kk-artifact-ref-${ref.tone}`}
                    onClick={() => onSelectFocus(ref.focusId!)}
                  >
                    <span>{ref.source}</span>
                    <strong>{ref.label}</strong>
                  </button>
                ) : (
                  <div key={`${ref.source}-${ref.id}`} className="kk-artifact-ref kk-artifact-ref-warning">
                    <span>{ref.source}</span>
                    <strong>{ref.label}</strong>
                  </div>
                ),
              )}
            </div>
          ) : null}

          {selected.visualQaHooks.length > 0 ? (
            <div className="kk-qa-hook-strip" aria-label="Subagent visual QA hooks">
              {selected.visualQaHooks.map((hook) => (
                <button
                  key={hook.id}
                  type="button"
                  className="kk-qa-hook"
                  onClick={() => onSelectFocus(hook.focusId)}
                >
                  <CheckCircle2 size={14} />
                  <span>{hook.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </article>
      )}
    </section>
  );
}

function ResearchWorkspacePanel({
  researchRuns,
  artifacts,
  citationLedger,
  onSelectFocus,
  onSelectCitation,
}: {
  researchRuns: RunDashboardResearchRun[];
  artifacts: RunDashboardArtifact[];
  citationLedger: WorkbenchCitationLedgerView;
  onSelectFocus: (id: string) => void;
  onSelectCitation: (id: string) => void;
}) {
  const sortedRuns = [...researchRuns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const evidenceCount = sortedRuns.reduce((total, run) => total + run.evidenceCount, 0);
  const citationCount = citationLedger.citations.length;
  return (
    <section className="kk-research-workspace" aria-label="Research evidence workspace">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Research</p>
          <h2>Evidence Desk</h2>
        </div>
        <span className="kk-count">{citationCount} citations</span>
      </div>

      <dl className="kk-ops-metrics">
        <div>
          <dt>Runs</dt>
          <dd>{sortedRuns.length}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{evidenceCount}</dd>
        </div>
        <div>
          <dt>Artifacts</dt>
          <dd>{artifacts.length}</dd>
        </div>
      </dl>

      <div className="kk-research-grid">
        <section aria-label="Research runs">
          <div className="kk-section-heading">
            <span>Runs</span>
            <span>{sortedRuns.length}</span>
          </div>
          <div className="kk-research-run-list">
            {sortedRuns.length === 0 ? (
              <div className="kk-empty">No research runs yet</div>
            ) : (
              sortedRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className="kk-research-run-row"
                  onClick={() => onSelectFocus(`research:${run.id}`)}
                >
                  <span className={`kk-dot kk-dot-${run.phase}`} />
                  <span>
                    <strong>{run.question ?? run.id}</strong>
                    <small>
                      {run.evidenceCount} evidence / {run.citationCount} citations
                    </small>
                  </span>
                  <span className={`kk-pill kk-pill-${run.phase}`}>{run.phase}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section aria-label="Latest citations">
          <div className="kk-section-heading">
            <span>Citation ledger</span>
            <span>{citationCount}</span>
          </div>
          <div className="kk-citation-list">
            {citationLedger.citations.length === 0 ? (
              <div className="kk-empty">No citations captured</div>
            ) : (
              citationLedger.citations.map((citation) => (
                <article
                  key={`${citation.runId}-${citation.id}`}
                  className={
                    citation.selected
                      ? `kk-citation-row kk-citation-row-active kk-citation-row-${citation.tone}`
                      : `kk-citation-row kk-citation-row-${citation.tone}`
                  }
                >
                  <button type="button" onClick={() => onSelectCitation(citation.id)}>
                    <FileSearch size={15} />
                    <span>
                      <strong>{citation.title}</strong>
                      <small>{citation.sourceLabel}</small>
                    </span>
                  </button>
                  {citation.href ? (
                    <a href={citation.href} target="_blank" rel="noreferrer" aria-label={`Open ${citation.title}`}>
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <CitationLedgerDetail ledger={citationLedger} onSelectFocus={onSelectFocus} />
    </section>
  );
}

function CitationLedgerDetail({
  ledger,
  onSelectFocus,
}: {
  ledger: WorkbenchCitationLedgerView;
  onSelectFocus: (id: string) => void;
}) {
  const selected = ledger.selected;
  return (
    <section className="kk-citation-detail" aria-label="Selected citation detail">
      <div className="kk-section-heading">
        <span>Selected citation</span>
        <span>{selected?.sourceLabel ?? "none"}</span>
      </div>
      {!selected ? (
        <div className="kk-empty">{ledger.emptyMessage ?? "No citation selected"}</div>
      ) : (
        <article className={`kk-selected-detail kk-selected-detail-${selected.tone}`}>
          <header>
            <span className={`kk-pill kk-pill-${selected.tone}`}>{selected.sourceLabel}</span>
            <h3>{selected.title}</h3>
            <p>{selected.summary}</p>
          </header>
          <DetailRows rows={selected.rows} />
          <div className="kk-citation-actions">
            {selected.href ? (
              <a className="kk-icon-button" href={selected.href} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                <span>Open source</span>
              </a>
            ) : null}
            {selected.artifactFocusId ? (
              <button
                type="button"
                className="kk-icon-button"
                onClick={() => onSelectFocus(selected.artifactFocusId!)}
              >
                <FileSearch size={14} />
                <span>Open artifact</span>
              </button>
            ) : null}
          </div>
        </article>
      )}
    </section>
  );
}

function ArtifactDetailsPanel({
  view,
  artifactPreview,
  onSelectArtifact,
}: {
  view: WorkbenchArtifactDetailsView;
  artifactPreview?: ArtifactPreviewState;
  onSelectArtifact: (id: string) => void;
}) {
  const selected = view.selected;
  return (
    <section className="kk-artifact-detail-panel" aria-label="Artifact detail cards">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Artifacts</p>
          <h2>Detail Cards</h2>
        </div>
        <span className={`kk-system-status kk-system-status-${view.visualQa.tone}`}>
          {view.visualQa.statusLabel}
        </span>
      </div>

      <dl className="kk-ops-metrics">
        {view.metrics.map((metric) => (
          <div key={metric.label} className={`kk-ops-${metric.tone}`}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>

      <div className="kk-artifact-card-list">
        {view.cards.length === 0 ? (
          <div className="kk-empty">{view.emptyMessage ?? "No artifacts yet"}</div>
        ) : (
          view.cards.slice(0, 8).map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              className={
                artifact.selected
                  ? `kk-artifact-card kk-artifact-card-active kk-artifact-card-${artifact.tone}`
                  : `kk-artifact-card kk-artifact-card-${artifact.tone}`
              }
              aria-pressed={artifact.selected}
              onClick={() => onSelectArtifact(artifact.id)}
            >
              <span className={`kk-dot kk-dot-${artifact.phase}`} />
              <span>
                <strong>{artifact.title}</strong>
                <small>{artifact.summary}</small>
              </span>
              {artifact.visualQa ? <em>QA</em> : null}
            </button>
          ))
        )}
      </div>

      {selected ? (
        <article className={`kk-selected-detail kk-artifact-selected kk-selected-detail-${selected.tone}`}>
          <header>
            <span className={`kk-pill kk-pill-${selected.phase}`}>{selected.kind ?? selected.phase}</span>
            <h3>{selected.title}</h3>
            <p>{selected.summary}</p>
          </header>
          {selected.qaLabels.length > 0 ? (
            <div className="kk-chip-strip" aria-label="Visual QA labels">
              {selected.qaLabels.map((label) => (
                <span key={label} className="kk-chip kk-chip-warning">
                  {label}
                </span>
              ))}
            </div>
          ) : null}
          <DetailRows rows={selected.rows} />
          <RelatedChipStrip title="Subagents" chips={selected.relatedSubagents} />
          <RelatedChipStrip title="Citations" chips={selected.relatedCitations} />
          <ArtifactContentPreview preview={artifactPreview} />
        </article>
      ) : null}
    </section>
  );
}

function DetailRows({ rows }: { rows: WorkbenchDetailRow[] }) {
  if (rows.length === 0) return <div className="kk-empty">No detail rows</div>;
  return (
    <dl className="kk-detail-list kk-compact-detail-list">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`}>
          <dt>{row.label}</dt>
          <dd>
            {row.href ? (
              <a href={row.href} target="_blank" rel="noreferrer">
                {row.value}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RelatedChipStrip({
  title,
  chips,
}: {
  title: string;
  chips: WorkbenchDetailChip[];
}) {
  if (chips.length === 0) return null;
  return (
    <div className="kk-related-strip" aria-label={`Related ${title.toLowerCase()}`}>
      <span>{title}</span>
      <div className="kk-chip-strip">
        {chips.map((chip) => (
          <span key={`${title}-${chip.label}`} className={`kk-chip kk-chip-${chip.tone}`}>
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RunWorkstreamPanel({
  workstream,
  onCancel,
  canCancel,
  onSelectItem,
}: {
  workstream: RunWorkstreamProjection;
  onCancel: () => void;
  canCancel: boolean;
  onSelectItem: (itemId: string, focusId?: string) => void;
}) {
  return (
    <section className="kk-primary-pane kk-workstream-pane" aria-label="Run workstream">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Run Workstream</p>
          <h2>Plan Board</h2>
        </div>
        <div className="kk-workstream-actions">
          <span className="kk-count">{workstream.summary.activeCards} active</span>
          <button type="button" className="kk-icon-button" onClick={onCancel} disabled={!canCancel}>
            <Square size={17} />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      <AttentionStrip
        items={workstream.attention}
        selectedItemId={workstream.selectedItemId}
        onSelectItem={onSelectItem}
      />

      <div className="kk-workstream-layout">
        <div className="kk-workstream-left">
          <PlanBoard
            columns={workstream.columns}
            selectedItemId={workstream.selectedItemId}
            onSelectItem={onSelectItem}
          />
          <InlineActivityStream
            activity={workstream.activity}
            selectedItemId={workstream.selectedItemId}
            onSelectItem={onSelectItem}
          />
        </div>
        <WorkstreamDetailDrawer detail={workstream.detail} />
      </div>
    </section>
  );
}

function AttentionStrip({
  items,
  selectedItemId,
  onSelectItem,
}: {
  items: RunWorkstreamAttentionItem[];
  selectedItemId?: string;
  onSelectItem: (itemId: string, focusId?: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="kk-attention-strip kk-attention-strip-empty" role="status">
        <CheckCircle2 size={16} />
        <span>No attention required</span>
      </div>
    );
  }

  return (
    <div className="kk-attention-strip" aria-label="Run attention strip">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={
            item.id === selectedItemId
              ? `kk-attention-item kk-attention-${item.severity} kk-attention-active`
              : `kk-attention-item kk-attention-${item.severity}`
          }
          aria-pressed={item.id === selectedItemId}
          onClick={() => onSelectItem(item.id, item.focusId)}
        >
          <AlertTriangle size={15} />
          <span>
            <strong>{item.title}</strong>
            <small>{item.actionLabel}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function PlanBoard({
  columns,
  selectedItemId,
  onSelectItem,
}: {
  columns: RunWorkstreamProjection["columns"];
  selectedItemId?: string;
  onSelectItem: (itemId: string, focusId?: string) => void;
}) {
  return (
    <div className="kk-plan-board" aria-label="Run plan board">
      {columns.map((column) => (
        <section key={column.id} className={`kk-board-column kk-board-${column.id}`}>
          <header>
            <div>
              <strong>{column.label}</strong>
              <small>{column.description}</small>
            </div>
            <span>{column.cards.length}</span>
          </header>
          <div className="kk-board-cards">
            {column.cards.length === 0 ? (
              <div className="kk-board-empty">Clear</div>
            ) : (
              column.cards.map((card) => (
                <WorkstreamCard
                  key={card.id}
                  card={card}
                  selected={card.id === selectedItemId}
                  onSelectItem={onSelectItem}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function WorkstreamCard({
  card,
  selected,
  onSelectItem,
}: {
  card: RunWorkstreamCard;
  selected: boolean;
  onSelectItem: (itemId: string, focusId?: string) => void;
}) {
  return (
    <button
      type="button"
      className={
        selected
          ? `kk-board-card kk-board-card-${card.tone} kk-board-card-active`
          : `kk-board-card kk-board-card-${card.tone}`
      }
      aria-pressed={selected}
      onClick={() => onSelectItem(card.id, card.focusId)}
    >
      <span className={`kk-dot kk-dot-${card.phase}`} />
      <span>
        <strong>{card.title}</strong>
        <small>{card.detail ?? card.kind}</small>
      </span>
      <span className={`kk-pill kk-pill-${card.phase}`}>{card.phase}</span>
      {card.meta.length > 0 ? (
        <span className="kk-board-card-meta">{card.meta.slice(0, 2).join(" / ")}</span>
      ) : null}
    </button>
  );
}

function InlineActivityStream({
  activity,
  selectedItemId,
  onSelectItem,
}: {
  activity: RunWorkstreamActivity[];
  selectedItemId?: string;
  onSelectItem: (itemId: string, focusId?: string) => void;
}) {
  return (
    <section className="kk-inline-activity" aria-label="Inline activity stream">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Activity</p>
          <h3>Live Stream</h3>
        </div>
        <Activity size={17} />
      </div>
      <ol role="log" aria-live="polite" aria-relevant="additions text">
        {activity.length === 0 ? (
          <li className="kk-empty">Start a run to populate activity</li>
        ) : (
          activity.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={
                  item.id === selectedItemId
                    ? `kk-activity-item kk-activity-${item.tone} kk-activity-active`
                    : `kk-activity-item kk-activity-${item.tone}`
                }
                aria-pressed={item.id === selectedItemId}
                onClick={() => onSelectItem(item.id, item.focusId)}
              >
                <span className="kk-timeline-rail" />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail ?? item.kind}</small>
                </span>
                <time>{formatClock(item.timestamp)}</time>
              </button>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

function WorkstreamDetailDrawer({ detail }: { detail?: RunWorkstreamDetailDrawer }) {
  if (!detail) {
    return (
      <aside className="kk-detail-drawer" aria-label="Workstream detail">
        <div className="kk-empty">Select work to inspect details</div>
      </aside>
    );
  }

  return (
    <aside className={`kk-detail-drawer kk-detail-drawer-${detail.tone}`} aria-label="Workstream detail">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Detail Drawer</p>
          <h3>{detail.title}</h3>
        </div>
        <span className={`kk-pill kk-pill-${detail.tone}`}>{detail.kind}</span>
      </div>
      <p>{detail.summary}</p>
      <dl className="kk-detail-list">
        {detail.details.map((item) => (
          <div key={`${detail.id}-${item.label}-${item.value}`}>
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
      {detail.relatedEventIds.length > 0 ? (
        <small>{detail.relatedEventIds.length} related events</small>
      ) : null}
    </aside>
  );
}

function SystemInspectorPanel({
  view,
  onViewChange,
  onSelectFocus,
  onSelectMcpTool,
}: {
  view: WorkbenchInspectorView;
  onViewChange: (id: WorkbenchInspectorViewId) => void;
  onSelectFocus: (id: string) => void;
  onSelectMcpTool: (id: string) => void;
}) {
  const panel = view.panel;
  return (
    <section
      className={`kk-rail-section kk-system-inspector kk-system-inspector-${panel.statusTone}`}
      aria-label="Runtime systems inspector"
    >
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">{panel.kicker}</p>
          <h2>{panel.title}</h2>
        </div>
        <span className={`kk-system-status kk-system-status-${panel.statusTone}`}>
          {panel.statusLabel}
        </span>
      </div>

      <div className="kk-system-tabs" role="tablist" aria-label="Runtime system views">
        {view.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === view.activeView}
            className={
              tab.id === view.activeView
                ? `kk-system-tab kk-system-tab-active kk-system-tab-${tab.tone}`
                : `kk-system-tab kk-system-tab-${tab.tone}`
            }
            onClick={() => onViewChange(tab.id)}
          >
            <span>{tab.label}</span>
            <small>{tab.count}</small>
          </button>
        ))}
      </div>

      <p className="kk-system-summary">{panel.summary}</p>

      <dl className="kk-system-metrics">
        {panel.metrics.map((metric) => (
          <div key={`${panel.id}-${metric.label}`} className={`kk-system-metric kk-system-${metric.tone}`}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>

      {panel.errorMessage ? (
        <div className="kk-empty kk-system-error" role="alert">
          {panel.errorMessage}
        </div>
      ) : null}

      {panel.mcpServers ? (
        <div className="kk-system-mcp-list">
          {panel.mcpServers.map((server) => (
            <article key={server.name} className={`kk-system-mcp-server kk-system-${server.tone}`}>
              <header>
                <span className={`kk-dot kk-dot-${server.tone}`} />
                <span>
                  <strong>{server.name}</strong>
                  <small>{server.health}</small>
                </span>
                <em>{server.discoveredToolCount}</em>
              </header>
              {server.error ? <p>{server.error}</p> : null}
              {server.tools.length > 0 ? (
                <div className="kk-system-tool-list">
                  {server.tools.slice(0, 4).map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      className={
                        tool.selected
                          ? `kk-system-row kk-system-row-active kk-system-${tool.tone}`
                          : `kk-system-row kk-system-${tool.tone}`
                      }
                      onClick={() => {
                        onSelectMcpTool(tool.id);
                        onViewChange("mcp");
                      }}
                    >
                      <Wrench size={14} />
                      <span>
                        <strong>{tool.title}</strong>
                        <small>{tool.detail}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="kk-system-rows">
          {panel.rows.length === 0 ? (
            <div className="kk-empty">{panel.emptyMessage ?? "No system records yet"}</div>
          ) : (
            panel.rows.slice(0, 6).map((row) => (
              <SystemInspectorRow key={row.id} row={row} onSelectFocus={onSelectFocus} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function SystemInspectorRow({
  row,
  onSelectFocus,
}: {
  row: WorkbenchInspectorView["panel"]["rows"][number];
  onSelectFocus: (id: string) => void;
}) {
  const content = (
    <>
      <span className={`kk-dot kk-dot-${row.tone}`} />
      <span>
        <strong>{row.title}</strong>
        <small>{row.detail ?? row.meta ?? row.id}</small>
      </span>
      {row.meta ? <em>{row.meta}</em> : null}
    </>
  );

  if (row.href) {
    return (
      <a
        className={`kk-system-row kk-system-${row.tone}`}
        href={row.href}
        target="_blank"
        rel="noreferrer"
      >
        {content}
      </a>
    );
  }

  if (row.focusId) {
    return (
      <button
        type="button"
        className={`kk-system-row kk-system-${row.tone}`}
        onClick={() => onSelectFocus(row.focusId!)}
      >
        {content}
      </button>
    );
  }

  return <div className={`kk-system-row kk-system-${row.tone}`}>{content}</div>;
}

function ActivityRailPanel({
  view,
  onSelectItem,
  onSelectFocus,
}: {
  view: RunActivityRailView;
  onSelectItem: (itemId: string, focusId?: string) => void;
  onSelectFocus: (id: string) => void;
}) {
  return (
    <section className="kk-rail-section kk-activity-rail" aria-label="Run activity summary">
      <div className="kk-pane-header">
        <div>
          <p className="kk-kicker">Run Activity</p>
          <h2>Task Focus</h2>
        </div>
        <Activity size={18} />
      </div>

      <dl className="kk-activity-rail-metrics">
        {view.metrics.map((metric) => (
          <div key={metric.id} className={`kk-activity-metric kk-activity-metric-${metric.tone}`}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>

      {view.empty ? (
        <div className="kk-empty">Start a run to populate task activity</div>
      ) : (
        <>
          <ActivitySelectionCard title="Selected Work" selection={view.selected} />

          {view.subagent ? (
            <button
              type="button"
              className="kk-activity-subagent"
              onClick={() => onSelectFocus(view.subagent!.id)}
            >
              <Bot size={16} />
              <span>
                <small>Subagent</small>
                <strong>{view.subagent.title}</strong>
                <em>{view.subagent.summary}</em>
              </span>
            </button>
          ) : (
            <div className="kk-empty">No subagent detail yet</div>
          )}

          <div className="kk-activity-rail-stream">
            <div className="kk-section-heading">
              <span>Latest activity</span>
              <span>{view.activity.length}</span>
            </div>
            <ol role="log" aria-live="polite" aria-relevant="additions text">
              {view.activity.length === 0 ? (
                <li className="kk-empty">No runtime events yet</li>
              ) : (
                view.activity.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`kk-activity-rail-item kk-activity-${item.tone}`}
                      onClick={() => onSelectItem(item.id, item.focusId)}
                    >
                      <span className="kk-timeline-rail" />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.detail ?? item.kind}</small>
                      </span>
                      <time>{formatClock(item.timestamp)}</time>
                    </button>
                  </li>
                ))
              )}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

function ActivitySelectionCard({
  title,
  selection,
}: {
  title: string;
  selection?: RunActivityRailSelection;
}) {
  if (!selection) {
    return <div className="kk-empty">Select work to inspect current task state</div>;
  }
  return (
    <article className={`kk-activity-focus kk-activity-focus-${selection.tone}`}>
      <header>
        <div>
          <small>{title}</small>
          <h3>{selection.title}</h3>
        </div>
        <span className={`kk-pill kk-pill-${selection.tone}`}>{selection.kind}</span>
      </header>
      <p>{selection.summary}</p>
      {selection.details.length > 0 ? (
        <dl className="kk-detail-list">
          {selection.details.slice(0, 4).map((item) => (
            <div key={`${selection.id}-${item.label}-${item.value}`}>
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
      ) : null}
      {selection.relatedEventCount > 0 ? (
        <small>{selection.relatedEventCount} related events</small>
      ) : null}
    </article>
  );
}

function McpDirectoryPanel({
  state,
  view,
  selectedTool,
  selectedToolId,
  playground,
  toolDetail,
  callState,
  onSelectTool,
  onArgumentDraftChange,
  onCallTool,
  onRefresh,
  onStartAndRefresh,
}: {
  state: McpDirectoryState;
  view: RuntimeMcpDirectoryView;
  selectedTool?: RuntimeMcpDirectoryTool;
  selectedToolId?: string;
  playground: RuntimeMcpToolPlaygroundView;
  toolDetail?: RunActivityRailMcpTool;
  callState: McpToolCallState;
  onSelectTool: (id: string) => void;
  onArgumentDraftChange: (toolId: string, draft: string) => void;
  onCallTool: () => void;
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

          <McpToolDetail
            tool={selectedTool}
            toolDetail={toolDetail}
            playground={playground}
            callState={callState}
            onArgumentDraftChange={onArgumentDraftChange}
            onCallTool={onCallTool}
          />
        </div>
      )}
    </section>
  );
}

function McpToolDetail({
  tool,
  toolDetail,
  playground,
  callState,
  onArgumentDraftChange,
  onCallTool,
}: {
  tool?: RuntimeMcpDirectoryTool;
  toolDetail?: RunActivityRailMcpTool;
  playground: RuntimeMcpToolPlaygroundView;
  callState: McpToolCallState;
  onArgumentDraftChange: (toolId: string, draft: string) => void;
  onCallTool: () => void;
}) {
  const [activeTab, setActiveTab] = useState<McpToolDetailTab>("details");
  if (!tool || !toolDetail) return <div className="kk-empty">No tools discovered</div>;
  const activeCall = callState.toolId === tool.id ? callState : { status: "idle" as const };
  const calling = activeCall.status === "loading";
  const invalidDraft = playground.draft.status === "invalid";
  const tabs: Array<{ id: McpToolDetailTab; label: string }> = [
    { id: "details", label: "Details" },
    { id: "run", label: "Run" },
    { id: "schema", label: "Schema" },
  ];
  return (
    <article className="kk-mcp-tool-detail" aria-busy={calling}>
      <header>
        <span>{toolDetail.server}</span>
        <h3>{toolDetail.title}</h3>
        <p>{toolDetail.description ?? toolDetail.name}</p>
      </header>
      <div className="kk-mcp-tabs" role="tablist" aria-label={`${toolDetail.title} detail tabs`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "kk-mcp-tab kk-mcp-tab-active" : "kk-mcp-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "details" ? (
        <div className="kk-mcp-tab-panel" role="tabpanel">
          <dl>
            <div>
              <dt>Tool</dt>
              <dd>{toolDetail.name}</dd>
            </div>
            <div>
              <dt>Inputs</dt>
              <dd>{toolDetail.inputSummary}</dd>
            </div>
            {tool.otel ? (
              <div>
                <dt>Span</dt>
                <dd>{tool.otel.spanName}</dd>
              </div>
            ) : null}
          </dl>
          {toolDetail.inputFields.length > 0 ? (
            <div className="kk-mcp-field-list" aria-label="MCP input fields">
              {toolDetail.inputFields.map((field) => (
                <span key={field.name} className={field.required ? "kk-mcp-field-required" : ""}>
                  {field.name}
                  <small>{field.type}{field.required ? " required" : ""}</small>
                </span>
              ))}
            </div>
          ) : null}
          <McpMetadataSection title="Trust" rows={toolDetail.trustRows} />
          <McpMetadataSection title="Policy" rows={toolDetail.policyRows} />
          <McpMetadataSection title="Audit" rows={toolDetail.auditRows} />
        </div>
      ) : null}

      {activeTab === "run" ? (
        <div className="kk-mcp-tab-panel" role="tabpanel">
          <label className="kk-mcp-arguments">
            <span>Arguments JSON</span>
            <textarea
              rows={5}
              value={playground.draft.text}
              spellCheck={false}
              onChange={(event) => onArgumentDraftChange(tool.id, event.target.value)}
            />
          </label>
          <div className="kk-mcp-call-actions">
            <button
              type="button"
              className="kk-icon-button"
              onClick={() => onArgumentDraftChange(tool.id, tool.argumentDraft)}
              disabled={calling}
            >
              <RefreshCw size={15} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              className="kk-submit kk-mcp-call-button"
              onClick={onCallTool}
              disabled={calling || invalidDraft}
            >
              <Play size={16} />
              {calling ? "Calling" : "Call tool"}
            </button>
          </div>
          {invalidDraft ? (
            <div className="kk-empty kk-mcp-error" role="alert">
              {toolDetail.draftError ?? "MCP arguments must be a JSON object"}
            </div>
          ) : null}
          {activeCall.status === "error" ? (
            <div className="kk-empty kk-mcp-error">{activeCall.message ?? "MCP call failed"}</div>
          ) : null}
          {activeCall.status === "ready" && playground.callSummary ? (
            <div className={`kk-mcp-call-result kk-mcp-call-result-${playground.callSummary.status}`}>
              <strong>{playground.callSummary.title}</strong>
              <small>{playground.callSummary.detail}</small>
              <McpMetadataRows rows={playground.callSummary.rows} />
              <pre>{playground.callSummary.contentText}</pre>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "schema" ? (
        <div className="kk-mcp-tab-panel" role="tabpanel">
          <pre>{toolDetail.schemaText}</pre>
        </div>
      ) : null}
    </article>
  );
}

function McpMetadataSection({ title, rows }: { title: string; rows: RuntimeMcpMetadataRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="kk-mcp-metadata" aria-label={`MCP ${title.toLowerCase()} metadata`}>
      <h4>{title}</h4>
      <McpMetadataRows rows={rows} />
    </section>
  );
}

function McpMetadataRows({ rows }: { rows: RuntimeMcpMetadataRow[] }) {
  return (
    <dl className="kk-mcp-metadata-rows">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`}>
          <dt>{row.label}</dt>
          <dd className={`kk-mcp-metadata-${row.tone}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
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
