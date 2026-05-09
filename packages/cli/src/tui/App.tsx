import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { readdirSync } from "node:fs";

import { StatusBar } from "./StatusBar.js";
import { Timeline } from "./Timeline.js";
import { ContextDrawer } from "./ContextDrawer.js";
import { SidebarPanel } from "./SidebarPanel.js";
import { InputArea } from "./InputArea.js";
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

import type { InspectorTab, TuiMode, McpServerStatus, SkillEntry } from "./types.js";
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
    return "—";
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
  const [sidebarOpen, setSidebarOpen] = useState(tuiConfig.sidebar.defaultOpen);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [skills] = useState<SkillEntry[]>([]);

  /* ---------- MCP ---------- */
  const mcpHook = useMcp(workspaceRoot);
  const mcpServers: McpServerStatus[] = mcpHook.servers;

  /* ---------- focus area ---------- */
  const [focusArea, setFocusArea] = useState<FocusArea>("input");

  /* ---------- drawer ---------- */
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerTab, setDrawerTab] = useState<InspectorTab>("attachments");

  /* ---------- input (centralised) ---------- */
  const [inputValue, setInputValue] = useState("");
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
  const showSidebar = sidebarOpen && termCols >= 90;
  const sidebarWidth = Math.max(24, tuiConfig.sidebar.width);
  const lineWidth = Math.max(24, termCols - 4 - (showSidebar ? sidebarWidth + 2 : 0));
  const theme = useMemo(() => resolveTheme(themeName, workspaceRoot), [themeName, workspaceRoot]);
  const availableThemes = useMemo(() => listThemeNames(workspaceRoot), [workspaceRoot]);

  const timelineLines = useMemo(
    () =>
      buildTimelineLines({
        entries: chatHook.timeline,
        thinking: chatHook.thinking,
        thinkingText:
          thinkingMode === "off"
            ? undefined
            : chatHook.thinkingText || chatHook.streamingContent || undefined,
        width: lineWidth,
        detailsLevel,
        thinkingMode,
        density,
      }),
    [
      chatHook.timeline,
      chatHook.thinking,
      chatHook.thinkingText,
      chatHook.streamingContent,
      lineWidth,
      detailsLevel,
      thinkingMode,
      density,
    ],
  );

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
          "No agent.toml found — run /about or kirakira-agent config init",
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

  /* ---------- derived palette state ---------- */
  const slashActive =
    inputValue.startsWith("/") && !inputValue.includes(" ");
  const slashFilter = slashActive ? inputValue.slice(1) : "";
  const filteredSlash = slashActive
    ? SLASH_COMMAND_DEFS.filter((d) =>
        d.name.toLowerCase().startsWith(slashFilter.toLowerCase()),
      )
    : [];

  const atPos = inputValue.lastIndexOf("@");
  const mentionActive =
    atPos >= 0 && !inputValue.slice(atPos + 1).includes(" ");
  const mentionFilter = mentionActive ? inputValue.slice(atPos + 1) : "";
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
  const chromeRows = 6 + approvalOverlayRows + paletteOverlayRows;
  const visibleCount = Math.max(4, termRows - chromeRows);

  /* reset palette index when filter changes */
  useEffect(() => {
    setPaletteIdx(0);
  }, [slashFilter, mentionFilter]);

  /* ---------- drawer helpers ---------- */
  const toggleDrawer = useCallback(() => {
    setDrawerVisible((prev) => !prev);
  }, []);

  const showDrawer = useCallback(
    (tab: InspectorTab) => {
      if (drawerVisible && drawerTab === tab) {
        setDrawerVisible(false);
      } else {
        setDrawerTab(tab);
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
      subagents: s.subagents.map((x) => ({ ...x })),
      tools: s.tools.map((x) => ({ ...x })),
      memoryHits: s.memoryHits.map((x) => ({
        ...x,
        topItems: [...x.topItems],
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
    resumeSession: sessionHook.resume,
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
    mcpToolCount: mcpHook.tools.length,
    mcpRefresh: mcpHook.refresh,
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
        cfg.mcpServers[name] = {
          command: "npx",
          args: ["-y", pkg],
          env: { NODE_NO_WARNINGS: "1" },
        };
        wf(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
        chatHook.addSystemTimeline(`MCP: added "${name}" → restart agent to activate`);
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
        chatHook.addSystemTimeline(`$ ${cmd}`);
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
          if (out.trim()) chatHook.addSystemTimeline(out.trim());
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

        if (result.usage) {
          await appendSessionEvent(sessionHook.session.id, {
            ts: new Date().toISOString(),
            event: "response.complete",
            sessionId: sessionHook.session.id,
            traceId: sessionHook.session.traceId,
            data: { usage: result.usage },
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
  /* CENTRALISED KEY HANDLER — single useInput for the entire TUI     */
  /* ================================================================ */

  useInput((input, key) => {
    if (setupOpen) return;

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
      pageUp: !!(key as Record<string, unknown>).pageUp,
      pageDown: !!(key as Record<string, unknown>).pageDown,
    };

    const st: KeyState = {
      focusArea,
      leaderPending,
      leaderKey: tuiConfig.keybinds.leader,
      inputValue,
      inputHistory,
      historyIdx,
      scrollOffset,
      paletteIdx,
      timelineLength: timelineLines.length,
      visibleCount,
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
          setSidebarOpen((prev) => !prev);
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
          break;
        case "set_history_idx":
          setHistoryIdx(action.idx);
          break;
        case "set_scroll":
          setScrollOffset(action.offset);
          break;
        case "set_palette_idx":
          setPaletteIdx(action.idx);
          break;
        case "submit": {
          setInputValue("");
          setPaletteIdx(0);
          void handleSubmit(action.text);
          break;
        }
        case "tab_complete_slash": {
          const item = filteredSlash[Math.min(paletteIdx, filteredSlash.length - 1)];
          if (item) {
            setInputValue(`/${item.name} `);
            setPaletteIdx(0);
          }
          break;
        }
        case "tab_complete_mention": {
          const mItem = filteredMention[Math.min(paletteIdx, filteredMention.length - 1)];
          if (mItem) {
            setInputValue(`${action.prefix}@${mItem.relativePath} `);
            setPaletteIdx(0);
            const att = classifyMentionToken(mItem.relativePath);
            if (att) {
              if (att.kind === "file") att.path = mItem.absolutePath;
              setAttachments((prev) => [...prev, att]);
              if (mItem.category === "file" || mItem.category === "dir") {
                chatHook.addSystemTimeline(`📎 @${mItem.relativePath} → ${mItem.absolutePath}`);
              } else {
                chatHook.addSystemTimeline(`📎 @${mItem.relativePath}`);
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
          <Text color={theme.colors.accentMuted}>·</Text>
          <Text color={theme.colors.fg} bold>agent</Text>
        </Box>
        <Text dimColor color={theme.colors.textTertiary}>Initializing session…</Text>
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
      {/* ---- status bar (pinned top) ---- */}
      <StatusBar
        workspaceName={workspaceName}
        gitBranch={gitBranch}
        trust={trust}
        model={model}
        mode={mode}
        traceId={sessionHook.session.traceId}
        taskCount={runtimeStore.state.tasks.filter((t) => t.status === "running" || t.status === "queued").length}
        pendingApprovals={runtimeStore.state.pendingApprovals}
        memoryHits={runtimeStore.state.memoryHits.length}
        focusArea={focusArea}
        scrollOffset={scrollOffset}
        timelineLength={timelineLines.length}
        theme={theme}
      />

      {/* ---- main area (flexible, clipped) ---- */}
      <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
        {showSidebar && (
          <SidebarPanel
            width={sidebarWidth}
            theme={theme}
            sessionId={sessionHook.session.id}
            tasksRunning={runtimeStore.state.tasks.filter((t) => t.status === "running").length}
            tasksQueued={runtimeStore.state.tasks.filter((t) => t.status === "queued").length}
            subagentRunning={runtimeStore.state.subagents.filter((s) => s.status === "running").length}
            mcpCount={mcpServers.length}
            skillCount={skills.length}
            memoryHits={runtimeStore.state.memoryHits.length}
            pendingApprovals={runtimeStore.state.pendingApprovals}
            traceSpansOpen={runtimeStore.state.traceSpansOpen}
          />
        )}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
          <Timeline
            lines={timelineLines}
            hasContent={timelineLines.length > 0}
            scrollOffset={scrollOffset}
            visibleCount={visibleCount}
            focusArea={focusArea}
            theme={theme}
          />
        </Box>
        {drawerVisible && (
          <ContextDrawer
            attachments={attachments}
            skills={skills}
            mcpServers={mcpServers}
            mcpTools={mcpHook.tools.map((t) => ({ alias: t.alias, server: t.server, riskLevel: t.riskLevel }))}
            mcpReady={mcpHook.ready}
            activeTab={drawerTab}
            runtime={runtimeStore.state}
            sessions={sessions}
            workspaceRoot={workspaceRoot}
            themeName={themeName}
            detailsLevel={detailsLevel}
            thinkingMode={thinkingMode}
            mouseEnabled={tuiConfig.mouse}
            diffStyle={tuiConfig.diffStyle}
            theme={theme}
          />
        )}
      </Box>

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
      <InputArea
        value={inputValue}
        mode={mode}
        thinking={chatHook.thinking}
        focused={focusArea === "input"}
        theme={theme}
        model={model}
        attachments={attachments}
        taskCount={runtimeStore.state.tasks.filter((t) => t.status === "running").length}
      />

      {/* ---- hotkey bar (pinned bottom) ---- */}
      <HotkeyBar
        paletteActive={paletteActive}
        focusArea={focusArea}
        theme={theme}
        leaderLabel={tuiConfig.keybinds.leader}
      />
    </Box>
  );
}
