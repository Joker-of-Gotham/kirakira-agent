import React from "react";
import { Box, Text } from "ink";
import type { Attachment } from "../parser/mention.js";
import type { McpServerStatus, SkillEntry, InspectorTab, ThinkingDisplayMode, ToolDetailsLevel } from "./types.js";
import type { TuiTheme } from "./theme.js";
import type { RuntimeStoreState } from "./runtime-events.js";
import { usePolicyStatus } from "./hooks/usePolicyStatus.js";
import { useAuditVerify } from "./hooks/useAuditVerify.js";

interface SessionListItem {
  id: string;
  updatedAt: string;
  current?: boolean;
}

interface McpToolSummary {
  alias: string;
  server: string;
  riskLevel: string;
}

interface ContextDrawerProps {
  attachments: Attachment[];
  skills: SkillEntry[];
  mcpServers: McpServerStatus[];
  mcpTools?: McpToolSummary[];
  mcpReady?: boolean;
  activeTab: InspectorTab;
  runtime: RuntimeStoreState;
  sessions: SessionListItem[];
  workspaceRoot: string;
  themeName: string;
  detailsLevel: ToolDetailsLevel;
  thinkingMode: ThinkingDisplayMode;
  mouseEnabled: boolean;
  diffStyle: string;
  theme: TuiTheme;
}

const TAB_LABEL: Record<string, { icon: string; title: string }> = {
  attachments: { icon: "📎", title: "Attachments" },
  skills: { icon: "⚡", title: "Skills" },
  mcp: { icon: "🔌", title: "MCP Servers" },
  tasks: { icon: "●", title: "Tasks" },
  subagents: { icon: "◉", title: "Subagents" },
  memory: { icon: "🧠", title: "Memory" },
  policy: { icon: "⚖", title: "Policy" },
  trace: { icon: "◈", title: "Trace & Audit" },
  sessions: { icon: "◌", title: "Sessions" },
  config: { icon: "⚙", title: "Config" },
};

function statusTone(status: string, theme: TuiTheme): string {
  if (status === "running" || status === "healthy" || status === "completed" || status === "OK") {
    return theme.colors.success;
  }
  if (status === "queued" || status === "idle" || status === "degraded" || status === "pending") {
    return theme.colors.warning;
  }
  if (status === "failed" || status === "ERROR" || status === "unavailable" || status === "cancelled") {
    return theme.colors.danger;
  }
  return theme.colors.textTertiary;
}

function short(v: string, max = 28): string {
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

export function ContextDrawer({
  attachments,
  skills,
  mcpServers,
  mcpTools = [],
  mcpReady = false,
  activeTab,
  runtime,
  sessions,
  workspaceRoot,
  themeName,
  detailsLevel,
  thinkingMode,
  mouseEnabled,
  diffStyle,
  theme,
}: ContextDrawerProps): React.ReactElement {
  const tab = TAB_LABEL[activeTab] ?? TAB_LABEL.attachments!;
  const policy = usePolicyStatus({
    workspaceRoot,
    pollMs: activeTab === "policy" ? 5000 : 0,
  });
  const audit = useAuditVerify({
    pollMs: activeTab === "trace" ? 5000 : 0,
  });
  const traceEvents = runtime.events
    .filter((e) => e.type.startsWith("trace.") || e.type.startsWith("tool.call") || e.type === "error.raised")
    .slice(0, 10);

  return (
    <Box
      flexDirection="column"
      width={34}
      borderStyle="round"
      borderColor={theme.colors.border}
      overflow="hidden"
    >
      {/* Pinned header — always visible */}
      <Box paddingX={1} borderStyle="single" borderColor={theme.colors.border}
        borderLeft={false} borderRight={false} borderTop={false} borderBottom={true}>
        <Text bold color={theme.colors.brand}>
          {tab.icon} {tab.title}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor color={theme.colors.textTertiary}>Ctrl+O</Text>
      </Box>

      {/* Content area — clipped when drawer is shorter than content */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingX={1} paddingY={0}>

      {activeTab === "attachments" && (
        <Box flexDirection="column">
          {attachments.length === 0 ? (
            <Text dimColor color={theme.colors.textTertiary}>No files attached</Text>
          ) : (
            attachments.map((a, i) => (
              <Box key={`att-${i}`}>
                <Text color={theme.colors.tool}>
                  {a.kind === "file"
                    ? "📄"
                    : a.kind === "skill"
                      ? "⚡"
                      : a.kind === "mcp"
                        ? "🔌"
                        : a.kind === "memory"
                          ? "🧠"
                          : a.kind === "task"
                            ? "●"
                            : a.kind === "subagent"
                              ? "◉"
                              : a.kind === "trace"
                                ? "◈"
                                : "◍"}{" "}
                </Text>
                <Text dimColor color={theme.colors.textTertiary} wrap="truncate-end">
                  {a.path.length > 26 ? "…" + a.path.slice(-26) : a.path}
                </Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {activeTab === "skills" && (
        <Box flexDirection="column">
          {skills.length === 0 ? (
            <Text dimColor color={theme.colors.textTertiary}>No skills discovered</Text>
          ) : (
            skills.map((s, i) => (
              <Box key={`skill-${i}`}>
                <Text color={s.active ? theme.colors.success : theme.colors.textTertiary}>
                  {s.active ? "● " : "○ "}
                </Text>
                <Text wrap="truncate-end">
                  {s.name.length > 24 ? s.name.slice(0, 24) + "…" : s.name}
                </Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {activeTab === "mcp" && (
        <Box flexDirection="column">
          {!mcpReady ? (
            <Text dimColor color={theme.colors.warning}>⟳ Starting MCP servers…</Text>
          ) : mcpServers.length === 0 ? (
            <Text dimColor color={theme.colors.textTertiary}>No MCP servers configured</Text>
          ) : (
            <>
              {mcpServers.map((s, i) => {
                const toolCount = mcpTools.filter((t) => t.server === s.name).length;
                return (
                  <Box key={`mcp-${i}`}>
                    <Text color={s.healthy ? theme.colors.success : theme.colors.danger}>
                      {s.healthy ? "✓ " : "✗ "}
                    </Text>
                    <Text>{short(s.name, 16)}</Text>
                    <Text dimColor color={theme.colors.textTertiary}>
                      {" "}({toolCount} tools)
                    </Text>
                  </Box>
                );
              })}
              <Box marginTop={1}>
                <Text dimColor color={theme.colors.textTertiary}>
                  Total: {mcpTools.length} tools
                </Text>
              </Box>
            </>
          )}
        </Box>
      )}

      {activeTab === "tasks" && (
        <Box flexDirection="column">
          {runtime.tasks.length === 0 ? (
            <Text dimColor color={theme.colors.textTertiary}>No active tasks</Text>
          ) : (
            runtime.tasks.slice(0, 12).map((t) => (
              <Box key={`task-${t.id}`} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={statusTone(t.status, theme)}>{t.status === "running" ? "● " : t.status === "queued" ? "○ " : "✓ "}</Text>
                  <Text wrap="truncate-end">{short(t.title, 24)}</Text>
                </Box>
                <Text dimColor color={theme.colors.textTertiary}>id: {t.id}</Text>
                {t.subagentId && <Text dimColor color={theme.colors.textTertiary}>subagent: {t.subagentId}</Text>}
                {t.progress && (
                  <Text dimColor color={theme.colors.textTertiary}>
                    progress: {t.progress.done}/{t.progress.total}
                  </Text>
                )}
              </Box>
            ))
          )}
        </Box>
      )}

      {activeTab === "subagents" && (
        <Box flexDirection="column">
          {runtime.subagents.length === 0 ? (
            <Text dimColor color={theme.colors.textTertiary}>No runtime subagents</Text>
          ) : (
            runtime.subagents.slice(0, 12).map((s) => (
              <Box key={`sg-${s.id}`} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={statusTone(s.status, theme)}>{s.status === "running" ? "◉ " : "◌ "}</Text>
                  <Text>{short(s.role, 24)}</Text>
                </Box>
                <Text dimColor color={theme.colors.textTertiary}>id: {s.id}</Text>
                {s.taskId && <Text dimColor color={theme.colors.textTertiary}>task: {s.taskId}</Text>}
                {s.model && <Text dimColor color={theme.colors.textTertiary}>model: {short(s.model, 22)}</Text>}
                {s.contextUsage !== undefined && (
                  <Text dimColor color={theme.colors.textTertiary}>
                    context: {Math.round(s.contextUsage * 100)}%
                  </Text>
                )}
              </Box>
            ))
          )}
        </Box>
      )}

      {activeTab === "memory" && (
        <Box flexDirection="column">
          {runtime.memoryHits.length === 0 ? (
            <Text dimColor color={theme.colors.textTertiary}>No memory recalls yet</Text>
          ) : (
            runtime.memoryHits.slice(0, 10).map((m) => (
              <Box key={`mem-${m.id}`} flexDirection="column" marginBottom={1}>
                <Text color={theme.colors.memory}>query: {short(m.query, 24)}</Text>
                <Text dimColor color={theme.colors.textTertiary}>
                  items: {m.count}
                </Text>
                {(m.topItems ?? []).slice(0, 2).map((x, idx) => (
                  <Text key={`${m.id}_${idx}`} dimColor color={theme.colors.textTertiary}>
                    · {short(x, 26)}
                  </Text>
                ))}
              </Box>
            ))
          )}
        </Box>
      )}

      {activeTab === "policy" && (
        <Box flexDirection="column">
          <Text color={theme.colors.brand}>bundle: {policy.bundleId}</Text>
          <Text color={statusTone(policy.pdpHealthStatus, theme)}>
            pdp: {policy.transport} / {policy.pdpHealthStatus}
          </Text>
          <Text dimColor color={theme.colors.textTertiary}>signature: {policy.signatureStatus}</Text>
          <Text dimColor color={theme.colors.textTertiary}>
            approvals: pending {policy.pendingApprovals}, persisted {policy.persistedApprovalRecords}
          </Text>
          <Text dimColor color={theme.colors.textTertiary}>sandbox: {policy.sandboxProfile}</Text>
          <Text dimColor color={theme.colors.textTertiary}>airisk: {policy.airiskLatencyMsDisplay}</Text>
          {policy.failClosedLikely && (
            <Text color={theme.colors.warning}>fail-closed likely (degraded PDP)</Text>
          )}
          {policy.error && <Text color={theme.colors.danger}>error: {short(policy.error, 26)}</Text>}
        </Box>
      )}

      {activeTab === "trace" && (
        <Box flexDirection="column">
          <Text color={statusTone(audit.chainStatus, theme)}>ledger: {audit.chainStatus}</Text>
          <Text dimColor color={theme.colors.textTertiary}>
            segment: {audit.segmentId ?? "—"} ({String(audit.entryCount ?? 0)} entries)
          </Text>
          <Text dimColor color={theme.colors.textTertiary}>spans open: {runtime.traceSpansOpen}</Text>
          <Text dimColor color={theme.colors.textTertiary}>pending approvals: {runtime.pendingApprovals}</Text>
          <Text dimColor color={theme.colors.textTertiary}>remote anchor: {short(audit.remoteAnchorStatus, 26)}</Text>
          {audit.error && <Text color={theme.colors.danger}>verify error: {short(audit.error, 24)}</Text>}
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.colors.brand}>recent events</Text>
            {traceEvents.length === 0 ? (
              <Text dimColor color={theme.colors.textTertiary}>no trace events</Text>
            ) : (
              traceEvents.map((evt) => (
                <Text key={evt.eventId} dimColor color={theme.colors.textTertiary}>
                  · {short(evt.type, 30)}
                </Text>
              ))
            )}
          </Box>
        </Box>
      )}

      {activeTab === "sessions" && (
        <Box flexDirection="column">
          {sessions.length === 0 ? (
            <Text dimColor color={theme.colors.textTertiary}>No local sessions</Text>
          ) : (
            sessions.slice(0, 12).map((s) => (
              <Box key={`sess-${s.id}`}>
                <Text color={s.current ? theme.colors.success : theme.colors.textTertiary}>
                  {s.current ? "▸ " : "  "}
                </Text>
                <Text>{short(s.id, 18)}</Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {activeTab === "config" && (
        <Box flexDirection="column">
          <Text color={theme.colors.brand}>theme: {themeName}</Text>
          <Text dimColor color={theme.colors.textTertiary}>mouse: {mouseEnabled ? "on" : "off"}</Text>
          <Text dimColor color={theme.colors.textTertiary}>details: {detailsLevel}</Text>
          <Text dimColor color={theme.colors.textTertiary}>thinking: {thinkingMode}</Text>
          <Text dimColor color={theme.colors.textTertiary}>diff: {diffStyle}</Text>
          <Text dimColor color={theme.colors.textTertiary}>
            events: {runtime.events.length}
          </Text>
          <Text dimColor color={theme.colors.textTertiary}>
            run: {short(runtime.runId, 24)}
          </Text>
        </Box>
      )}
      </Box>{/* end content area */}
    </Box>
  );
}
