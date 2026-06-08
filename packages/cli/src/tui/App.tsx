import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { execSync } from "node:child_process";
import { basename, join } from "node:path";
import { readdirSync } from "node:fs";
import type { SessionEvent } from "@kirakira/core";

import { StatusBar } from "./StatusBar.js";
import { Timeline, measureTimelineRows } from "./Timeline.js";
import { ContextDrawer } from "./ContextDrawer.js";
import {
  InputArea,
  defaultInputAreaMaxPromptRows,
  measureInputAreaRows,
} from "./InputArea.js";
import { HomeScreen } from "./HomeScreen.js";
import { ProviderSetup } from "./ProviderSetup.js";
import { SlashPalette } from "./SlashPalette.js";
import { MentionComplete } from "./MentionComplete.js";
import type { MentionItem } from "./MentionComplete.js";
import { ApprovalCardV2 } from "./ApprovalCardV2.js";
import { HotkeyBar } from "./HotkeyBar.js";
import { buildTimelineLines } from "./timeline-lines.js";
import type { TuiConfig, ThinkingDisplay, ToolDetailsLevel, DensityMode } from "./config.js";
import { listThemeNames, resolveTheme } from "./theme.js";

import { useSession } from "./hooks/useSession.js";
import { useChat } from "./hooks/useChat.js";
import type { ChatSnapshot } from "./hooks/useChat.js";
import { useMcp } from "./hooks/useMcp.js";
import { useApproval } from "./hooks/useApproval.js";
import { useSlash } from "./hooks/useSlash.js";
import { useFirstRun } from "./hooks/useFirstRun.js";
import { useRuntimeStore } from "./hooks/useRuntimeStore.js";
import type { RuntimeStoreState } from "./runtime-events.js";

import type { InspectorTab, TuiMode, McpServerStatus, SkillEntry, TimelineEntry } from "./types.js";
import { SLASH_COMMAND_DEFS } from "./types.js";
import type { Attachment } from "../parser/mention.js";
import { classifyMentionToken } from "../parser/mention.js";
import {
  appendSessionEvent,
  listSessionFiles,
  sessionFileMtime,
} from "../session/store.js";
import type { ProviderConfig } from "../gateway/openai-complete.js";
import type { LlmProvider } from "../gateway/provider-catalog.js";
import { isUsableApiKey } from "../gateway/provider-catalog.js";
import { handleKey } from "./key-handler.js";
import type { FocusArea, KeyEvent, KeyState } from "./key-handler.js";
import { TuiMouseInputDecoder, isLikelyMouseInput, isPrintableTextInput } from "./mouse.js";
export type { FocusArea } from "./key-handler.js";

/* ------------------------------------------------------------------ */

interface AppProps {
  initialModel: string;
  initialMode: TuiMode;
  workspaceName: string;
  workspaceRoot: string;
  trust: string;
  tuiConfig: TuiConfig;
  providerConfig?: ProviderConfig;
}

interface SessionListItem {
  id: string;
  updatedAt: string;
  current?: boolean;
}

interface UiSnapshot {
  chat: ChatSnapshot;
  attachments: Attachment[];
  runtime: RuntimeStoreState;
}

/* ------------------------------------------------------------------ */

function getGitBranch(cwd: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "?";
  }
}

function scanFiles(
  root: string,
  prefix: string,
  maxDepth: number,
  depth = 0,
): MentionItem[] {
  if (depth >= maxDepth) return [];
  const out: MentionItem[] = [];
  try {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (
        e.name.startsWith(".") ||
        e.name === "node_modules" ||
        e.name === "dist" ||
        e.name === "__pycache__"
      )
        continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const abs = join(root, e.name);
      if (e.isDirectory()) {
        out.push({
          label: rel + "/",
          relativePath: rel + "/",
          absolutePath: abs,
          category: "dir",
        });
        out.push(...scanFiles(abs, rel, maxDepth, depth + 1));
      } else {
        out.push({
          label: rel,
          relativePath: rel,
          absolutePath: abs,
          category: "file",
        });
      }
    }
  } catch {
    /* permission error */
  }
  return out;
}

function maxScrollFor(totalRows: number, visibleCount: number): number {
  return Math.max(0, totalRows - Math.max(1, visibleCount));
}

function isPassiveStartupEntry(entry: TimelineEntry): boolean {
  if (entry.kind !== "system") return false;
  return /^(MCP:|No agent\.toml|Compatible configs:|Configured )/u.test(entry.text);
}

function mapSessionModeToTui(mode: unknown): TuiMode | null {
  if (mode === "ask") return "ask";
  if (mode === "plan") return "plan";
  if (mode === "exec" || mode === "debug") return "debug";
  if (mode === "repl" || mode === "agent") return "agent";
  return null;
}

function eventData(event: SessionEvent): Record<string, unknown> {
  return event.data && typeof event.data === "object"
    ? event.data as Record<string, unknown>
    : {};
}

function dataString(event: SessionEvent, keys: string[]): string {
  const data = eventData(event);
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function sessionEventsToSnapshot(events: SessionEvent[]): ChatSnapshot {
  const messages: ChatSnapshot["messages"] = [];
  const timeline: TimelineEntry[] = [];
  let chunkBuffer = "";

  events.forEach((event, index) => {
    const id = `resume_${index}`;
    if (event.event === "prompt.submit") {
      const text = dataString(event, ["text", "prompt", "content"]);
      if (!text) return;
      messages.push({ role: "user", content: text });
      timeline.push({ id, ts: event.ts, kind: "user", text });
      return;
    }

    if (event.event === "response.chunk") {
      chunkBuffer += dataString(event, ["text", "delta", "content"]);
      return;
    }

    if (event.event === "response.complete") {
      const text = dataString(event, ["text", "content", "response"]) || chunkBuffer.trim();
      chunkBuffer = "";
      if (!text) return;
      messages.push({ role: "assistant", content: text });
      timeline.push({ id, ts: event.ts, kind: "agent", text });
      return;
    }

    if (event.event === "shell.exec" || event.event === "mcp.invoke") {
      const data = eventData(event);
      const name = String(data.name ?? data.tool ?? (event.event === "shell.exec" ? "shell" : "mcp"));
      const args = data.args ?? data.command ?? data;
      timeline.push({
        id,
        ts: event.ts,
        kind: "tool_call",
        text: `call ${name} ${JSON.stringify(args)}`,
      });
      return;
    }

    if (event.event === "shell.result" || event.event === "mcp.result") {
      const data = eventData(event);
      const name = String(data.name ?? data.tool ?? (event.event === "shell.result" ? "shell" : "mcp"));
      const ok = data.ok !== false;
      const latency = typeof data.latencyMs === "number" ? `${data.latencyMs}ms ` : "";
      const body = dataString(event, ["text", "output", "result", "error"]) || JSON.stringify(data);
      timeline.push({
        id,
        ts: event.ts,
        kind: "tool_result",
        text: `${ok ? "done" : "fail"} ${name} ${latency}${body}`,
      });
      return;
    }

    if (event.event === "error") {
      const text = dataString(event, ["message", "error", "text"]) || "Unknown session error";
      timeline.push({ id, ts: event.ts, kind: "error", text });
    }
  });

  return { messages, timeline };
}

/* ================================================================== */

export function App({
  initialModel,
  initialMode,
  workspaceName,
  workspaceRoot,
  trust,
  tuiConfig,
  providerConfig,
}: AppProps): React.ReactElement {
  const app = useApp();

  /* ---------- core state ---------- */
  const [model, setModel] = useState(initialModel);
  const [providerConfigState, setProviderConfigState] = useState<ProviderConfig | undefined>(providerConfig);
  const [setupOpen, setSetupOpen] = useState(() => !providerConfig || !isUsableApiKey(providerConfig.apiKey));
  const [mode, setMode] = useState<TuiMode>(initialMode);
  const [gitBranch] = useState(() => getGitBranch(workspaceRoot));
  const [vimMode, setVimMode] = useState(false);
  const [themeName, setThemeName] = useState(tuiConfig.theme);
  const [detailsLevel, setDetailsLevel] = useState<ToolDetailsLevel>(tuiConfig.timeline.toolDetails);
  const [thinkingMode, setThinkingMode] = useState<ThinkingDisplay>(tuiConfig.timeline.showReasoning);
  const [density, setDensity] = useState<DensityMode>(tuiConfig.density);
  const [leaderPending, setLeaderPending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [skills] = useState<SkillEntry[]>([]);
  const [toolResultsExpanded, setToolResultsExpanded] = useState(false);

  /* ---------- MCP ---------- */
  const mcpHook = useMcp(workspaceRoot);
  const mcpServers: McpServerStatus[] = mcpHook.servers;

  /* ---------- focus area ---------- */
  const [focusArea, setFocusArea] = useState<FocusArea>("input");

  /* ---------- drawer ---------- */
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerTab, setDrawerTab] = useState<InspectorTab>("attachments");
  const [drawerQuery, setDrawerQuery] = useState("");
  const [drawerIndex, setDrawerIndex] = useState(0);
  const [drawerDetailIndex, setDrawerDetailIndex] = useState(0);
  const [drawerDetailOpen, setDrawerDetailOpen] = useState(false);

  /* ---------- input (centralised) ---------- */
  const [inputValue, setInputValue] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  /* ---------- palette ---------- */
  const [paletteIdx, setPaletteIdx] = useState(0);

  /* ---------- timeline scroll ---------- */
  const [scrollOffset, setScrollOffset] = useState(0);

  /* ---------- file items for @ ---------- */
  const [fileItems, setFileItems] = useState<MentionItem[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [undoStack, setUndoStack] = useState<UiSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<UiSnapshot[]>([]);
  const mouseDecoder = useRef(new TuiMouseInputDecoder());

  /* ---------- hooks ---------- */
  const sessionHook = useSession();
  const chatHook = useChat({
    providerConfig: providerConfigState,
    tools: mcpHook.tools,
    workspaceRoot,
    callTool: mcpHook.callTool,
  });
  const approvalHook = useApproval();
  const runtimeStore = useRuntimeStore();
  const { checks: firstRunChecks } = useFirstRun(workspaceRoot, trust);

  const termRows = process.stdout.rows ?? 24;
  const termCols = process.stdout.columns ?? 80;
  const displayWorkspaceName = basename(workspaceRoot) || workspaceName;
  const timelineChromeWidth = 12;
  const lineWidth = Math.max(24, termCols - timelineChromeWidth);
  const theme = useMemo(() => resolveTheme(themeName, workspaceRoot), [themeName, workspaceRoot]);
  const availableThemes = useMemo(() => listThemeNames(workspaceRoot), [workspaceRoot]);
  const runtimeTasks = runtimeStore.state.tasks;
  const activeTaskCount = runtimeTasks.filter((t) => t.status === "running" || t.status === "queued").length;
  const runningTaskCount = runtimeTasks.filter((t) => t.status === "running").length;
  const taskProgress = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const task of runtimeTasks) {
      if (!task.progress || task.progress.total <= 0) continue;
      done += task.progress.done;
      total += task.progress.total;
    }
    return { done, total };
  }, [runtimeTasks]);
  const mcpHealthyCount = mcpServers.filter((server) => server.healthy).length;

  const timelineLines = useMemo(
    () =>
      buildTimelineLines({
        entries: chatHook.timeline,
        thinking: false,
        width: lineWidth,
        detailsLevel,
        thinkingMode,
        density,
        theme,
      }),
    [
      chatHook.timeline,
      lineWidth,
      detailsLevel,
      thinkingMode,
      density,
      theme,
    ],
  );
  const timelineRowCount = useMemo(
    () => measureTimelineRows(timelineLines, lineWidth, toolResultsExpanded, theme),
    [timelineLines, lineWidth, toolResultsExpanded, theme],
  );
  const hasTimelineContent = chatHook.timeline.some((entry) => !isPassiveStartupEntry(entry));
  const showStatusBar = hasTimelineContent || chatHook.thinking || activeTaskCount > 0 || scrollOffset > 0;

  /* scan files on mount */
  useEffect(() => {
    const items = scanFiles(workspaceRoot, "", 3);
    for (const s of skills) {
      items.push({
        label: `skill/${s.name}`,
        relativePath: `skill/${s.name}`,
        absolutePath: s.name,
        category: "skill",
      });
    }
    for (const m of mcpServers) {
      items.push({
        label: `mcp/${m.name}:resource`,
        relativePath: `mcp/${m.name}:resource`,
        absolutePath: m.name,
        category: "mcp",
      });
    }

    const memoryRefs = [
      "memory/entity/600519.SH/timeline",
      "memory/workspace/current/schemas",
      "memory/run/latest/episodes",
    ];
    for (const ref of memoryRefs) {
      items.push({
        label: ref,
        relativePath: ref,
        absolutePath: ref,
        category: "memory",
      });
    }

    const gitRefs = ["git/diff", "git/staged", "git/untracked"];
    for (const ref of gitRefs) {
      items.push({
        label: ref,
        relativePath: ref,
        absolutePath: ref,
        category: "git",
      });
    }

    for (const task of runtimeStore.state.tasks.slice(0, 20)) {
      items.push({
        label: `task/${task.id}`,
        relativePath: `task/${task.id}`,
        absolutePath: task.title,
        category: "task",
      });
    }

    for (const sg of runtimeStore.state.subagents.slice(0, 20)) {
      items.push({
        label: `subagent/${sg.id}`,
        relativePath: `subagent/${sg.id}`,
        absolutePath: sg.role,
        category: "subagent",
      });
    }

    for (const evt of runtimeStore.state.events
      .filter((e) => e.type.startsWith("trace."))
      .slice(0, 20)) {
      items.push({
        label: `trace/${evt.eventId}`,
        relativePath: `trace/${evt.eventId}`,
        absolutePath: evt.type,
        category: "trace",
      });
    }

    setFileItems(items);
  }, [
    workspaceRoot,
    skills,
    mcpServers,
    runtimeStore.state.tasks,
    runtimeStore.state.subagents,
    runtimeStore.state.events,
  ]);

  /* init session */
  useEffect(() => {
    void sessionHook.init(model, mode, workspaceName);
  }, []);

  useEffect(() => {
    if (!sessionHook.session) return;
    setUndoStack([]);
    setRedoStack([]);
    const runId = `run_${sessionHook.session.id.slice(0, 12)}`;
    runtimeStore.reset(runId);
    runtimeStore.emit("session.created", {
      sessionId: sessionHook.session.id,
      traceId: sessionHook.session.traceId,
      workspace: workspaceName,
    }, { runId });
  }, [sessionHook.session?.id]);

  useEffect(() => {
    let active = true;
    const loadSessions = async (): Promise<void> => {
      try {
        const ids = await listSessionFiles();
        const rows = await Promise.all(
          ids.map(async (id) => {
            const mtime = await sessionFileMtime(id);
            return {
              id,
              updatedAt: mtime.toISOString(),
              current: sessionHook.session?.id === id,
            };
          }),
        );
        rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (active) setSessions(rows.slice(0, 30));
      } catch {
        if (active) setSessions([]);
      }
    };

    void loadSessions();
    const t = setInterval(() => {
      void loadSessions();
    }, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [sessionHook.session?.id]);

  /* first-run hints */
  useEffect(() => {
    if (firstRunChecks && sessionHook.session) {
      if (!firstRunChecks.hasConfig) {
        chatHook.addSystemTimeline(
          "No agent.toml found - run /about or kirakira-agent config init",
        );
      }
      if (firstRunChecks.compatDetected.length > 0) {
        chatHook.addSystemTimeline(
          `Compatible configs: ${firstRunChecks.compatDetected.join(", ")}`,
        );
      }
    }
  }, [firstRunChecks, sessionHook.session]);

  /* MCP status notification */
  useEffect(() => {
    if (!mcpHook.ready) return;
    if (mcpHook.error) {
      chatHook.addSystemTimeline(`MCP: ${mcpHook.error}`);
    } else if (mcpHook.servers.length > 0) {
      const healthy = mcpHook.servers.filter((s) => s.healthy).length;
      chatHook.addSystemTimeline(
        `MCP: ${healthy}/${mcpHook.servers.length} servers online, ${mcpHook.tools.length} tools available`,
      );
    }
  }, [mcpHook.ready]);

  useEffect(() => {
    if (!approvalHook.current) return;
    runtimeStore.emit("approval.created", {
      id: approvalHook.current.id,
      kind: approvalHook.current.kind,
    });
  }, [approvalHook.current?.id]);

  /* auto-scroll to bottom on new timeline entries */
  useEffect(() => {
    setScrollOffset(0);
  }, [chatHook.timeline.length]);

  useEffect(() => {
    if (!tuiConfig.mouse || !process.stdin.isTTY || !process.stdout.isTTY) return;
    process.stdout.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
    return () => {
      process.stdout.write("\x1b[?1002l\x1b[?1000l\x1b[?1006l");
    };
  }, [tuiConfig.mouse]);

  /* ---------- derived palette state ---------- */
  const slashActive =
    cursorIndex === inputValue.length && inputValue.startsWith("/") && !inputValue.includes(" ");
  const slashFilter = slashActive ? inputValue.slice(1) : "";
  const filteredSlash = slashActive
    ? SLASH_COMMAND_DEFS.filter((d) =>
        d.name.toLowerCase().startsWith(slashFilter.toLowerCase()),
      )
    : [];

  const inputBeforeCursor = inputValue.slice(0, cursorIndex);
  const atPos = inputBeforeCursor.lastIndexOf("@");
  const mentionActive =
    atPos >= 0 && !inputBeforeCursor.slice(atPos + 1).includes(" ");
  const mentionFilter = mentionActive ? inputBeforeCursor.slice(atPos + 1) : "";
  const filteredMention = mentionActive
    ? fileItems.filter((it) =>
        it.label.toLowerCase().includes(mentionFilter.toLowerCase()),
      )
    : [];

  const paletteActive = slashActive || (mentionActive && !slashActive);

  /* ---------- dynamic visibleCount: deduct overlay heights ---------- */
  const approvalOverlayRows = approvalHook.current ? 14 : 0;
  const paletteOverlayRows =
    (slashActive && filteredSlash.length > 0)
      ? Math.min(filteredSlash.length + 3, 11)
      : (mentionActive && !slashActive && filteredMention.length > 0)
        ? Math.min(filteredMention.length + 3, 11)
        : 0;
  const composerMaxPromptRows = defaultInputAreaMaxPromptRows(termRows);
  const composerRows = hasTimelineContent
    ? measureInputAreaRows({
      value: inputValue,
      cursorIndex,
      thinking: chatHook.thinking,
      focused: focusArea === "input",
      attachments,
      cols: termCols,
      maxPromptRows: composerMaxPromptRows,
      activeToolName: chatHook.activeTool?.name,
    })
    : 0;
  const composerGapRows = hasTimelineContent ? 1 : 0;
  const hotkeyRows = 1;
  const timelineSafetyRows = hasTimelineContent ? 1 : 0;
  const statusGapRows = showStatusBar ? 1 : 0;
  const chromeRows =
    (showStatusBar ? 1 : 0)
    + statusGapRows
    + composerGapRows
    + composerRows
    + hotkeyRows
    + timelineSafetyRows
    + approvalOverlayRows
    + paletteOverlayRows;
  const visibleCount = Math.max(4, termRows - chromeRows);
  const transcriptVisibleRows = Math.max(1, visibleCount);
  const timelineMaxScroll = maxScrollFor(timelineRowCount, transcriptVisibleRows);

  useEffect(() => {
    setScrollOffset((prev) => Math.min(prev, timelineMaxScroll));
  }, [timelineMaxScroll]);

  /* reset palette index when filter changes */
  useEffect(() => {
    setPaletteIdx(0);
  }, [slashFilter, mentionFilter]);

  /* ---------- drawer helpers ---------- */
  const toggleDrawer = useCallback(() => {
    setDrawerVisible((prev) => {
      if (!prev) {
        setDrawerQuery("");
        setDrawerIndex(0);
        setDrawerDetailIndex(0);
        setDrawerDetailOpen(false);
      }
      return !prev;
    });
  }, []);

  const showDrawer = useCallback(
    (tab: InspectorTab) => {
      if (drawerVisible && drawerTab === tab) {
        setDrawerVisible(false);
      } else {
        setDrawerTab(tab);
        setDrawerQuery("");
        setDrawerIndex(0);
        setDrawerDetailIndex(0);
        setDrawerDetailOpen(false);
        setDrawerVisible(true);
      }
    },
    [drawerVisible, drawerTab],
  );

  const cloneRuntimeState = useCallback(
    (s: RuntimeStoreState): RuntimeStoreState => ({
      ...s,
      events: s.events.map((e) => ({ ...e, payload: { ...(e.payload ?? {}) } })),
      tasks: s.tasks.map((t) => ({
        ...t,
        progress: t.progress ? { ...t.progress } : undefined,
      })),
      subagents: s.subagents.map((x) => ({
        ...x,
        scope: x.scope ? structuredClone(x.scope) : undefined,
        contract: x.contract ? structuredClone(x.contract) : undefined,
        result: x.result ? structuredClone(x.result) : undefined,
      })),
      tools: s.tools.map((x) => ({ ...x })),
      memoryHits: s.memoryHits.map((x) => ({
        ...x,
        topItems: [...x.topItems],
      })),
      researchRuns: s.researchRuns.map((x) => ({
        ...x,
        sourceKinds: x.sourceKinds ? [...x.sourceKinds] : undefined,
        latestCitation: x.latestCitation ? structuredClone(x.latestCitation) : undefined,
      })),
    }),
    [],
  );

  const buildSnapshot = useCallback((): UiSnapshot => ({
    chat: chatHook.snapshot(),
    attachments: attachments.map((a) => ({ ...a })),
    runtime: cloneRuntimeState(runtimeStore.state),
  }), [chatHook, attachments, runtimeStore.state, cloneRuntimeState]);

  const restoreSnapshot = useCallback((snap: UiSnapshot): void => {
    chatHook.restoreSnapshot(snap.chat);
    setAttachments(snap.attachments.map((a) => ({ ...a })));
    runtimeStore.hydrate(cloneRuntimeState(snap.runtime));
  }, [chatHook, runtimeStore, cloneRuntimeState]);

  const pushUndoSnapshot = useCallback((): void => {
    const snap = buildSnapshot();
    setUndoStack((prev) => [snap, ...prev].slice(0, 80));
    setRedoStack([]);
  }, [buildSnapshot]);

  const undoConversation = useCallback((): boolean => {
    if (undoStack.length === 0) return false;
    const current = buildSnapshot();
    const target = undoStack[0]!;
    restoreSnapshot(target);
    setUndoStack((prev) => prev.slice(1));
    setRedoStack((prev) => [current, ...prev].slice(0, 80));
    return true;
  }, [undoStack, buildSnapshot, restoreSnapshot]);

  const redoConversation = useCallback((): boolean => {
    if (redoStack.length === 0) return false;
    const current = buildSnapshot();
    const target = redoStack[0]!;
    restoreSnapshot(target);
    setRedoStack((prev) => prev.slice(1));
    setUndoStack((prev) => [current, ...prev].slice(0, 80));
    return true;
  }, [redoStack, buildSnapshot, restoreSnapshot]);

  const queryMatches = useCallback(
    (...parts: Array<string | number | boolean | undefined>): boolean => {
      const q = drawerQuery.trim().toLowerCase();
      if (!q) return true;
      return parts
        .filter((part): part is string | number | boolean => part !== undefined)
        .some((part) => String(part).toLowerCase().includes(q));
    },
    [drawerQuery],
  );

  const visibleDrawerSessions = useMemo(
    () => sessions.filter((session) => queryMatches(session.id, session.updatedAt, session.current)),
    [sessions, queryMatches],
  );

  const visibleDrawerMcpServers = useMemo(
    () => mcpServers.filter((server) => {
      const toolCount = mcpHook.tools.filter((tool) => tool.server === server.name).length;
      return queryMatches(server.name, server.health, server.error, toolCount);
    }),
    [mcpServers, mcpHook.tools, queryMatches],
  );

  const selectedDrawerMcpServer = visibleDrawerMcpServers[Math.min(drawerIndex, Math.max(0, visibleDrawerMcpServers.length - 1))];
  const selectedDrawerMcpTools = useMemo(
    () => selectedDrawerMcpServer
      ? mcpHook.tools.filter((tool) => tool.server === selectedDrawerMcpServer.name)
      : [],
    [mcpHook.tools, selectedDrawerMcpServer],
  );

  const drawerItemCount = useMemo(() => {
    if (drawerTab === "attachments") {
      return attachments.filter((item) => queryMatches(item.kind, item.path)).length;
    }
    if (drawerTab === "skills") {
      return skills.filter((skill) => queryMatches(skill.name, skill.description, skill.active)).length;
    }
    if (drawerTab === "mcp") {
      return visibleDrawerMcpServers.length;
    }
    if (drawerTab === "tasks") {
      return Math.min(12, runtimeStore.state.tasks.filter((task) =>
        queryMatches(task.id, task.title, task.status, task.subagentId),
      ).length);
    }
    if (drawerTab === "subagents") {
      return Math.min(12, runtimeStore.state.subagents.filter((subagent) =>
        queryMatches(subagent.id, subagent.role, subagent.status, subagent.model, subagent.taskId),
      ).length);
    }
    if (drawerTab === "memory") {
      return Math.min(10, runtimeStore.state.memoryHits.filter((memory) =>
        queryMatches(memory.id, memory.query, memory.count, ...(memory.topItems ?? [])),
      ).length);
    }
    if (drawerTab === "trace") {
      return runtimeStore.state.events.filter((event) =>
        (event.type.startsWith("trace.") || event.type.startsWith("tool.call") || event.type === "error.raised") &&
        queryMatches(event.eventId, event.type),
      ).length;
    }
    if (drawerTab === "sessions") return Math.min(12, visibleDrawerSessions.length);
    return 1;
  }, [
    attachments,
    skills,
    mcpServers,
    mcpHook.tools,
    visibleDrawerMcpServers.length,
    runtimeStore.state.tasks,
    runtimeStore.state.subagents,
    runtimeStore.state.memoryHits,
    runtimeStore.state.events,
    drawerTab,
    queryMatches,
    visibleDrawerSessions.length,
  ]);

  useEffect(() => {
    setDrawerIndex((prev) => Math.max(0, Math.min(prev, Math.max(0, drawerItemCount - 1))));
  }, [drawerItemCount]);

  useEffect(() => {
    setDrawerDetailIndex((prev) => Math.max(0, Math.min(prev, Math.max(0, selectedDrawerMcpTools.length - 1))));
  }, [selectedDrawerMcpTools.length]);

  useEffect(() => {
    setDrawerDetailOpen(false);
    setDrawerDetailIndex(0);
  }, [drawerTab, drawerQuery]);

  const resumeSessionById = useCallback(
    async (id: string): Promise<SessionEvent[]> => {
      const events = await sessionHook.resume(id);
      const start = events.find((event) => event.event === "session.start");
      const data = start ? eventData(start) : {};
      const resumedModel = typeof data.model === "string" ? data.model : "";
      const resumedMode = mapSessionModeToTui(data.mode);
      if (resumedModel) setModel(resumedModel);
      if (resumedMode) setMode(resumedMode);
      setUndoStack([]);
      setRedoStack([]);
      setAttachments([]);
      chatHook.restoreSnapshot(sessionEventsToSnapshot(events));
      setDrawerVisible(false);
      setDrawerIndex(0);
      setScrollOffset(0);
      return events;
    },
    [chatHook, sessionHook],
  );

  /* ---------- slash context ---------- */
  const slashCtx = {
    session: sessionHook.session ?? { id: "", traceId: "" },
    model,
    themeName,
    availableThemes,
    detailsLevel,
    thinkingMode,
    density,
    mode,
    workspaceName,
    workspaceRoot,
    vimMode,
    autoRun: approvalHook.autoRun,
    trust,
    messages: chatHook.messages,
    setMode,
    setModel,
    setThemeName,
    setDetailsLevel,
    setThinkingMode,
    setDensity,
    setVimMode,
    setAutoRun: approvalHook.setAutoRun,
    addSystemTimeline: chatHook.addSystemTimeline,
    clearHistory: chatHook.clearHistory,
    resetSession: async (nextModel: string, nextMode: string, nextWorkspace: string) => {
      setUndoStack([]);
      setRedoStack([]);
      await sessionHook.reset(nextModel, nextMode, nextWorkspace);
    },
    compact: chatHook.compact,
    resumeSession: resumeSessionById,
    undo: () => undoConversation(),
    redo: () => redoConversation(),
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    showDrawer,
    openSetup: () => setSetupOpen(true),
    requestExit: () => {
      void sessionHook.finish("quit").then(() => app.exit());
    },
    mcpServers: mcpHook.servers,
    mcpReady: mcpHook.ready,
    mcpToolCount: mcpHook.tools.length,
    mcpRefresh: mcpHook.reload,
    mcpAdd: async (pkg: string) => {
      try {
        const { existsSync: ex, readFileSync: rf, writeFileSync: wf } = await import("node:fs");
        const { getMcpConfigPath: gp } = await import("@kirakira/core");
        const cfgPath = gp(workspaceRoot);
        let cfg: { mcpServers: Record<string, unknown> } = { mcpServers: {} };
        if (ex(cfgPath)) {
          cfg = JSON.parse(rf(cfgPath, "utf-8")) as typeof cfg;
          if (!cfg.mcpServers) cfg.mcpServers = {};
        }
        const name = pkg
          .replace(/@[^/]*\//, "")
          .replace(/@.*$/, "")
          .replace(/^server-/, "")
          .replace(/^mcp-server-/, "")
          .replace(/^mcp-/, "") || "mcp-server";
        const serverName = pkg.includes("@modelcontextprotocol/server-filesystem")
          ? "filesystem-core"
          : name;
        const serverArgs = ["-y", pkg];
        if (pkg.includes("server-filesystem")) {
          serverArgs.push(workspaceRoot);
        }
        cfg.mcpServers[serverName] = {
          command: "npx",
          args: serverArgs,
          env: { NODE_NO_WARNINGS: "1" },
        };
        wf(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
        await mcpHook.reload();
        chatHook.addSystemTimeline(`MCP: added "${serverName}" and reloaded tools`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        chatHook.addSystemTimeline(`MCP add failed: ${msg}`);
      }
    },
  };
  const { handleSlash } = useSlash(slashCtx);

  const handleProviderConfigured = useCallback((config: ProviderConfig, configuredProvider: LlmProvider): void => {
    setProviderConfigState(config);
    setModel(config.defaultModel);
    setSetupOpen(false);
    chatHook.addSystemTimeline(`Configured ${configuredProvider.label} with ${config.defaultModel}.`);
  }, [chatHook]);

  /* ---------- submit ---------- */
  const handleSubmit = useCallback(
    async (text: string) => {
      if (!sessionHook.session) return;

      if (!providerConfigState || !isUsableApiKey(providerConfigState.apiKey)) {
        setSetupOpen(true);
        chatHook.addSystemTimeline("LLM provider is not configured. Complete setup before sending a prompt.");
        return;
      }

      const turnTs = Date.now();
      const turnKey = turnTs.toString(36);
      const taskId = `task_${turnKey}`;
      const subagentId = `sg_${turnKey}`;
      const spanId = `span_${turnKey}`;
      const runId = runtimeStore.state.runId;

      setInputHistory((prev) => {
        const deduped = prev.filter((h) => h !== text);
        return [text, ...deduped].slice(0, 100);
      });
      setHistoryIdx(-1);
      setScrollOffset(0);

      if (text.startsWith("/")) {
        const body = text.slice(1).trimStart();
        const sp = body.search(/\s/);
        const cmd = sp === -1 ? body : body.slice(0, sp);
        const args = sp === -1 ? "" : body.slice(sp).trimStart();
        runtimeStore.emit(
          "message.user.added",
          { kind: "slash", command: cmd, args },
          { runId },
        );
        await handleSlash(cmd, args);
        return;
      }

      if (text.startsWith("!")) {
        pushUndoSnapshot();
        const cmd = text.slice(1).trim();
        if (!cmd) return;
        const toolId = `tool_${turnKey}`;
        const start = Date.now();
        chatHook.addTimelineEntry({
          id: `shell_call_${turnKey}`,
          ts: new Date().toISOString(),
          kind: "tool_call",
          text: `call shell ${JSON.stringify({ command: cmd })}`,
        });
        runtimeStore.emit(
          "tool.call.started",
          { id: toolId, name: "shell", status: "running", summary: cmd },
          { runId },
        );
        runtimeStore.emit(
          "trace.span.started",
          { id: `${spanId}_shell`, name: "shell.exec", command: cmd },
          { runId },
        );
        try {
          const out = execSync(cmd, {
            encoding: "utf-8",
            cwd: workspaceRoot,
            maxBuffer: 16 * 1024 * 1024,
            stdio: ["pipe", "pipe", "pipe"],
          });
          const elapsed = Date.now() - start;
          chatHook.addTimelineEntry({
            id: `shell_done_${turnKey}`,
            ts: new Date().toISOString(),
            kind: "tool_result",
            text: `done shell ${elapsed}ms ${out.trim().slice(0, 4000) || "(no output)"}`,
          });
          runtimeStore.emit(
            "tool.call.completed",
            {
              id: toolId,
              name: "shell",
              status: "completed",
              latencyMs: elapsed,
              summary: cmd,
            },
            { runId },
          );
          runtimeStore.emit(
            "trace.span.completed",
            { id: `${spanId}_shell`, name: "shell.exec" },
            { runId },
          );
        } catch (e) {
          const elapsed = Date.now() - start;
          runtimeStore.emit(
            "tool.call.failed",
            {
              id: toolId,
              name: "shell",
              status: "failed",
              latencyMs: elapsed,
              summary: cmd,
            },
            { runId },
          );
          runtimeStore.emit(
            "error.raised",
            {
              code: "Kirakira-SHELL-EXEC",
              message: e instanceof Error ? e.message : String(e),
            },
            { runId },
          );
          runtimeStore.emit(
            "trace.span.completed",
            { id: `${spanId}_shell`, name: "shell.exec" },
            { runId },
          );
          chatHook.addTimelineEntry({
            id: `shell_fail_${turnKey}`,
            ts: new Date().toISOString(),
            kind: "tool_result",
            text: `fail shell: ${(e instanceof Error ? e.message : String(e)).slice(0, 500)}`,
          });
          chatHook.addTimelineEntry({
            id: `err_${Date.now()}`,
            ts: new Date().toISOString(),
            kind: "error",
            text: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          });
        }
        return;
      }

      /* resolve @mentions to absolute paths */
      pushUndoSnapshot();
      const mentionTokens = text.match(/@([^\s@]+)/g);
      if (mentionTokens) {
        const newAtt: Attachment[] = [];
        for (const tok of mentionTokens) {
          const raw = tok.slice(1);
          const att = classifyMentionToken(raw);
          if (att) {
            if (att.kind === "file") att.path = join(workspaceRoot, att.path);
            newAtt.push(att);
            if (att.kind === "memory") {
              runtimeStore.emit(
                "memory.recalled",
                {
                  id: `mem_${turnKey}_${newAtt.length}`,
                  query: att.path,
                  topItems: [att.path, "episode:latest", "belief:top"],
                  count: 3,
                },
                { runId },
              );
            }
          }
        }
        if (newAtt.length > 0) {
          setAttachments((prev) => [...prev, ...newAtt]);
        }
      }

      runtimeStore.emit(
        "message.user.added",
        {
          kind: "prompt",
          text,
          attachmentCount: attachments.length,
        },
        { runId },
      );
      runtimeStore.emit(
        "task.created",
        {
          id: taskId,
          title: text.slice(0, 80),
          status: "running",
          progress: { done: 1, total: 3 },
          subagentId,
        },
        { runId },
      );
      runtimeStore.emit(
        "subagent.created",
        {
          id: subagentId,
          role: mode === "plan" ? "planner" : "runtime-worker",
          status: "running",
          model,
          taskId,
          contextUsage: 0.35,
        },
        { runId },
      );
      runtimeStore.emit(
        "trace.span.started",
        { id: spanId, name: "chat.turn", taskId },
        { runId },
      );

      await appendSessionEvent(sessionHook.session.id, {
        ts: new Date().toISOString(),
        event: "prompt.submit",
        sessionId: sessionHook.session.id,
        traceId: sessionHook.session.traceId,
        data: {
          text,
          attachments: attachments.map((a) => ({
            kind: a.kind,
            path: a.path,
          })),
        },
      });

      try {
        const result = await chatHook.sendChat(text, model);
        if (result.ok) {
          runtimeStore.emit(
            "message.assistant.completed",
            {
              taskId,
              usage: result.usage ?? null,
            },
            { runId },
          );
          runtimeStore.emit(
            "task.updated",
            {
              id: taskId,
              title: text.slice(0, 80),
              status: "completed",
              progress: { done: 3, total: 3 },
              subagentId,
            },
            { runId },
          );
          runtimeStore.emit(
            "subagent.updated",
            {
              id: subagentId,
              role: mode === "plan" ? "planner" : "runtime-worker",
              status: "completed",
              model,
              taskId,
              contextUsage: 0.56,
            },
            { runId },
          );
        } else {
          runtimeStore.emit(
            "task.updated",
            {
              id: taskId,
              title: text.slice(0, 80),
              status: "failed",
              subagentId,
            },
            { runId },
          );
          runtimeStore.emit(
            "subagent.updated",
            {
              id: subagentId,
              role: mode === "plan" ? "planner" : "runtime-worker",
              status: "failed",
              model,
              taskId,
            },
            { runId },
          );
          runtimeStore.emit(
            "error.raised",
            {
              code: "Kirakira-CHAT-FAILED",
              message: "chat completion failed",
            },
            { runId },
          );
        }
        runtimeStore.emit(
          "trace.span.completed",
          { id: spanId, name: "chat.turn" },
          { runId },
        );

        if (result.usage || result.text) {
          await appendSessionEvent(sessionHook.session.id, {
            ts: new Date().toISOString(),
            event: "response.complete",
            sessionId: sessionHook.session.id,
            traceId: sessionHook.session.traceId,
            data: { usage: result.usage, text: result.text ?? "" },
          });
        }
      } catch (e) {
        runtimeStore.emit(
          "task.updated",
          {
            id: taskId,
            title: text.slice(0, 80),
            status: "failed",
            subagentId,
          },
          { runId },
        );
        runtimeStore.emit(
          "subagent.updated",
          {
            id: subagentId,
            role: mode === "plan" ? "planner" : "runtime-worker",
            status: "failed",
            model,
            taskId,
          },
          { runId },
        );
        runtimeStore.emit(
          "error.raised",
          {
            code: "Kirakira-CHAT-FAILED",
            message: e instanceof Error ? e.message : String(e),
          },
          { runId },
        );
        runtimeStore.emit(
          "trace.span.completed",
          { id: spanId, name: "chat.turn" },
          { runId },
        );
        chatHook.addTimelineEntry({
          id: `err_${Date.now()}`,
          ts: new Date().toISOString(),
          kind: "error",
          text: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [
      sessionHook.session,
      model,
      mode,
      workspaceRoot,
      chatHook,
      handleSlash,
      attachments,
      runtimeStore,
      pushUndoSnapshot,
      providerConfigState,
    ],
  );

  /* ================================================================ */
  /* CENTRALISED KEY HANDLER - single useInput for the entire TUI     */
  /* ================================================================ */

  useInput((input, key) => {
    if (setupOpen) return;

    const shouldDecodeMouse =
      mouseDecoder.current.hasPending() || isLikelyMouseInput(input);
    const decodedInput = shouldDecodeMouse
      ? mouseDecoder.current.feed(input)
      : { consumed: false, event: null };
    if (decodedInput.consumed) {
      const mouse = decodedInput.event;
      if (!mouse) return;
      if (drawerVisible) return;
      const step = 1;
      if (mouse.kind === "wheel-up" || mouse.kind === "wheel-down") {
        setScrollOffset((prev) => {
          const max = timelineMaxScroll;
          return mouse.kind === "wheel-up"
            ? Math.min(max, prev + step)
            : Math.max(0, prev - step);
        });
        setFocusArea("scroll");
      } else if (mouse.kind === "click") {
        setFocusArea(mouse.y >= Math.max(1, termRows - 3) ? "input" : "scroll");
      }
      return;
    }

    if (drawerVisible) {
      if (key.ctrl && input === "c") {
        void sessionHook.finish("sigint").then(() => app.exit());
        return;
      }
      if (key.ctrl && input === "r") {
        setToolResultsExpanded((prev) => !prev);
        return;
      }
      if (key.escape) {
        if (drawerDetailOpen) {
          setDrawerDetailOpen(false);
          return;
        }
        setDrawerVisible(false);
        return;
      }
      if (key.upArrow) {
        if (drawerDetailOpen && drawerTab === "mcp") {
          setDrawerDetailIndex((prev) => Math.max(0, prev - 1));
        } else {
          setDrawerIndex((prev) => Math.max(0, prev - 1));
        }
        return;
      }
      if (key.downArrow) {
        if (drawerDetailOpen && drawerTab === "mcp") {
          setDrawerDetailIndex((prev) => Math.min(Math.max(0, selectedDrawerMcpTools.length - 1), prev + 1));
        } else {
          setDrawerIndex((prev) => Math.min(Math.max(0, drawerItemCount - 1), prev + 1));
        }
        return;
      }
      if (key.return) {
        if (!drawerDetailOpen) {
          setDrawerDetailOpen(true);
          setDrawerDetailIndex(0);
          return;
        }
        if (drawerTab === "sessions") {
          const selected = visibleDrawerSessions[Math.min(drawerIndex, visibleDrawerSessions.length - 1)];
          if (selected) {
            void resumeSessionById(selected.id)
              .then((events) => {
                chatHook.addSystemTimeline(`Resumed session ${selected.id.slice(0, 12)} (${events.length} events).`);
              })
              .catch((e) => {
                chatHook.addSystemTimeline(`Resume failed: ${e instanceof Error ? e.message : String(e)}`);
              });
          }
        }
        return;
      }
      if (key.backspace) {
        setDrawerQuery((prev) => prev.slice(0, -1));
        setDrawerIndex(0);
        setDrawerDetailIndex(0);
        setDrawerDetailOpen(false);
        return;
      }
      if (!key.ctrl && !key.meta && isPrintableTextInput(input)) {
        setDrawerQuery((prev) => `${prev}${input}`);
        setDrawerIndex(0);
        setDrawerDetailIndex(0);
        setDrawerDetailOpen(false);
        return;
      }
      return;
    }

    /* ---- approval mode: only accept approval keys ---- */
    if (approvalHook.current) {
      const resolveApproval = (decision: "allow_once" | "allow_session" | "allow_workspace" | "deny" | "deny_block"): void => {
        const result = approvalHook.decide(decision);
        runtimeStore.emit("approval.resolved", {
          id: approvalHook.current?.id ?? "unknown",
          decision,
          allowed: result.allowed,
          remembered: result.remembered,
        });
      };
      const ch = input.toLowerCase();
      if (ch === "y") resolveApproval("allow_once");
      else if (ch === "a" || ch === "!") resolveApproval("allow_session");
      else if (ch === "w") resolveApproval("allow_workspace");
      else if (ch === "n") resolveApproval("deny");
      else if (ch === "#") resolveApproval("deny_block");
      else if (ch === "v") {
        chatHook.addSystemTimeline(
          "Details: " + JSON.stringify(approvalHook.current.detail, null, 2),
        );
      }
      return;
    }

    if (chatHook.thinking && key.return) return;

    const ev: KeyEvent = {
      input,
      ctrl: !!key.ctrl,
      meta: !!key.meta,
      escape: !!key.escape,
      return: !!key.return,
      shift: !!key.shift,
      tab: !!key.tab,
      backspace: !!key.backspace,
      delete: !!key.delete,
      upArrow: !!key.upArrow,
      downArrow: !!key.downArrow,
      leftArrow: !!key.leftArrow,
      rightArrow: !!key.rightArrow,
      home: !!(key as Record<string, unknown>).home,
      end: !!(key as Record<string, unknown>).end,
      pageUp: !!(key as Record<string, unknown>).pageUp,
      pageDown: !!(key as Record<string, unknown>).pageDown,
    };

    const st: KeyState = {
      focusArea,
      leaderPending,
      leaderKey: tuiConfig.keybinds.leader,
      inputValue,
      cursorIndex,
      inputHistory,
      historyIdx,
      scrollOffset,
      paletteIdx,
      timelineLength: timelineRowCount,
      visibleCount: transcriptVisibleRows,
      slashActive,
      mentionActive,
      paletteActive,
      filteredSlashCount: filteredSlash.length,
      filteredMentionCount: filteredMention.length,
      atPos,
    };

    const result = handleKey(ev, st);

    for (const action of result.actions) {
      switch (action.type) {
        case "exit":
          void sessionHook.finish("sigint").then(() => app.exit());
          break;
        case "set_leader_pending":
          setLeaderPending(action.pending);
          break;
        case "redraw":
          chatHook.addSystemTimeline("[screen redrawn]");
          break;
        case "toggle_drawer":
          toggleDrawer();
          break;
        case "toggle_sidebar":
          showDrawer("sessions");
          break;
        case "toggle_tool_details":
          setToolResultsExpanded((prev) => !prev);
          break;
        case "show_drawer":
          showDrawer(action.tab as InspectorTab);
          break;
        case "execute_slash":
          void handleSubmit(`/${action.command}`);
          break;
        case "focus":
          setFocusArea(action.area);
          break;
        case "set_input":
          setInputValue(action.value);
          setCursorIndex(Math.max(0, Math.min(action.value.length, action.cursorIndex ?? cursorIndex)));
          break;
        case "set_cursor":
          setCursorIndex(Math.max(0, Math.min(inputValue.length, action.cursorIndex)));
          break;
        case "set_history_idx":
          setHistoryIdx(action.idx);
          break;
        case "set_scroll":
          setScrollOffset(Math.max(0, Math.min(action.offset, timelineMaxScroll)));
          break;
        case "set_palette_idx":
          setPaletteIdx(action.idx);
          break;
        case "submit": {
          setInputValue("");
          setCursorIndex(0);
          setPaletteIdx(0);
          void handleSubmit(action.text);
          break;
        }
        case "tab_complete_slash": {
          const item = filteredSlash[Math.min(paletteIdx, filteredSlash.length - 1)];
          if (item) {
            const nextValue = `/${item.name} `;
            setInputValue(nextValue);
            setCursorIndex(nextValue.length);
            setPaletteIdx(0);
          }
          break;
        }
        case "tab_complete_mention": {
          const mItem = filteredMention[Math.min(paletteIdx, filteredMention.length - 1)];
          if (mItem) {
            const suffix = inputValue.slice(cursorIndex);
            const nextValue = `${action.prefix}@${mItem.relativePath} ${suffix}`;
            const nextCursor = `${action.prefix}@${mItem.relativePath} `.length;
            setInputValue(nextValue);
            setCursorIndex(nextCursor);
            setPaletteIdx(0);
            const att = classifyMentionToken(mItem.relativePath);
            if (att) {
              if (att.kind === "file") att.path = mItem.absolutePath;
              setAttachments((prev) => [...prev, att]);
              if (mItem.category === "file" || mItem.category === "dir") {
                chatHook.addSystemTimeline(`@${mItem.relativePath} -> ${mItem.absolutePath}`);
              } else {
                chatHook.addSystemTimeline(`@${mItem.relativePath}`);
              }
            }
          }
          break;
        }
        case "noop":
          break;
      }
    }
  });

  /* ================================================================ */
  /* RENDER                                                           */
  /* ================================================================ */

  if (!sessionHook.session) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
      >
        <Box>
          <Text color={theme.colors.textSecondary}>kirakira</Text>
          <Text color={theme.colors.accentMuted}> · </Text>
          <Text color={theme.colors.fg} bold>agent</Text>
        </Box>
        <Text dimColor color={theme.colors.textTertiary}>Initializing session...</Text>
      </Box>
    );
  }

  if (setupOpen) {
    return (
      <ProviderSetup
        workspaceRoot={workspaceRoot}
        theme={theme}
        onConfigured={handleProviderConfigured}
      />
    );
  }

  return (
    <Box flexDirection="column" width={termCols} height={termRows}>
      {showStatusBar && (
        <StatusBar
          workspaceName={displayWorkspaceName}
          gitBranch={gitBranch}
          trust={trust}
          model={model}
          mode={mode}
          traceId={sessionHook.session.traceId}
          taskCount={activeTaskCount}
          pendingApprovals={runtimeStore.state.pendingApprovals}
          memoryHits={runtimeStore.state.memoryHits.length}
          focusArea={focusArea}
          scrollOffset={scrollOffset}
          timelineLength={timelineRowCount}
          scrollLimit={timelineMaxScroll}
          theme={theme}
          totalTasks={taskProgress.total}
          completedTasks={taskProgress.done}
          thinking={chatHook.thinking}
          mcpReady={mcpHook.ready}
          mcpHealthy={mcpHealthyCount}
          mcpTotal={mcpServers.length}
          activeToolName={chatHook.activeTool?.name}
        />
      )}
      {showStatusBar && <Box height={1} flexShrink={0} />}

      {/* ---- main area (flexible, clipped) ---- */}
      <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
        <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
          {hasTimelineContent ? (
            <Timeline
              lines={timelineLines}
              hasContent={hasTimelineContent}
              scrollOffset={scrollOffset}
              visibleCount={visibleCount}
              focusArea={focusArea}
              theme={theme}
              thinking={chatHook.thinking}
              thinkingText={thinkingMode === "off" ? "" : chatHook.thinkingText}
              streamingContent={chatHook.streamingContent}
              thinkingMode={thinkingMode}
              activeTool={chatHook.activeTool}
              expandedToolResults={toolResultsExpanded}
              contentWidth={lineWidth}
            />
          ) : (
            <HomeScreen theme={theme}>
              <InputArea
                value={inputValue}
                cursorIndex={cursorIndex}
                mode={mode}
                thinking={chatHook.thinking}
                focused={focusArea === "input"}
                maxPromptRows={composerMaxPromptRows}
                theme={theme}
                model={model}
                attachments={attachments}
                taskCount={runningTaskCount}
                activeToolName={chatHook.activeTool?.name}
              />
            </HomeScreen>
          )}
        </Box>
      </Box>

      {drawerVisible && (
        <Box
          position="absolute"
          top={Math.max(1, Math.floor(termRows * 0.12))}
          left={0}
          width={termCols}
          height={Math.max(10, termRows - 4)}
          alignItems="center"
          justifyContent="center"
        >
          <ContextDrawer
            attachments={attachments}
            skills={skills}
            mcpServers={mcpServers}
            mcpTools={mcpHook.tools.map((t) => ({
              alias: t.alias,
              server: t.server,
              nativeTool: t.nativeTool,
              description: t.description,
              riskLevel: t.riskLevel,
              readOnly: t.readOnly,
              inputSchema: t.inputSchema,
            }))}
            mcpReady={mcpHook.ready}
            activeTab={drawerTab}
            query={drawerQuery}
            selectedIndex={drawerIndex}
            detailIndex={drawerDetailIndex}
            runtime={runtimeStore.state}
            sessions={sessions}
            workspaceRoot={workspaceRoot}
            themeName={themeName}
            detailsLevel={detailsLevel}
            thinkingMode={thinkingMode}
            mouseEnabled={tuiConfig.mouse}
            diffStyle={tuiConfig.diffStyle}
            theme={theme}
            detailOpen={drawerDetailOpen}
          />
        </Box>
      )}

      {/* ---- approval overlay ---- */}
      {approvalHook.current && (
        <ApprovalCardV2 request={approvalHook.current} theme={theme} />
      )}

      {/* ---- slash palette ---- */}
      {slashActive && filteredSlash.length > 0 && (
        <SlashPalette items={filteredSlash} selectedIndex={paletteIdx} theme={theme} />
      )}

      {/* ---- mention palette ---- */}
      {mentionActive && !slashActive && filteredMention.length > 0 && (
        <MentionComplete
          items={filteredMention}
          selectedIndex={paletteIdx}
          theme={theme}
        />
      )}

      {/* ---- input (pinned bottom) ---- */}
      {hasTimelineContent && (
        <InputArea
          value={inputValue}
          cursorIndex={cursorIndex}
          mode={mode}
          thinking={chatHook.thinking}
          focused={focusArea === "input"}
          topGapRows={composerGapRows}
          maxPromptRows={composerMaxPromptRows}
          theme={theme}
          model={model}
          attachments={attachments}
          taskCount={runningTaskCount}
          activeToolName={chatHook.activeTool?.name}
        />
      )}

      {/* ---- hotkey bar (pinned bottom) ---- */}
      <HotkeyBar
        paletteActive={paletteActive}
        focusArea={focusArea}
        theme={theme}
        toolResultsExpanded={toolResultsExpanded}
      />
    </Box>
  );
}
