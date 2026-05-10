import React from "react";
import { Box, Text } from "ink";
import type { Attachment } from "../parser/mention.js";
import type { McpServerStatus, SkillEntry, InspectorTab, ThinkingDisplayMode, ToolDetailsLevel } from "./types.js";
import type { TuiTheme } from "./theme.js";
import type { RuntimeStoreState } from "./runtime-events.js";
import { usePolicyStatus } from "./hooks/usePolicyStatus.js";
import { useAuditVerify } from "./hooks/useAuditVerify.js";
import { ProgressBar, Spinner, StatusPill } from "./motion.js";

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
  query: string;
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

const TAB_TITLE: Record<InspectorTab, string> = {
  attachments: "Context",
  skills: "Skills",
  mcp: "MCPs",
  tasks: "Tasks",
  subagents: "Agents",
  memory: "Memory",
  policy: "Policy",
  trace: "Trace",
  sessions: "Sessions",
  config: "Config",
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

function statusPillTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "running" || status === "healthy" || status === "completed" || status === "OK") return "success";
  if (status === "queued" || status === "idle" || status === "degraded" || status === "pending") return "warning";
  if (status === "failed" || status === "ERROR" || status === "unavailable" || status === "cancelled") return "danger";
  return "neutral";
}

function short(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

function matchesQuery(query: string, ...parts: Array<string | number | boolean | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts
    .filter((part): part is string | number | boolean => part !== undefined)
    .some((part) => String(part).toLowerCase().includes(q));
}

function EmptyState({ text, theme }: { text: string; theme: TuiTheme }): React.ReactElement {
  return <Text dimColor color={theme.colors.textTertiary}>{text}</Text>;
}

function DrawerRow({
  children,
  theme,
  tone = "neutral",
}: {
  children: React.ReactNode;
  theme: TuiTheme;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}): React.ReactElement {
  const accent =
    tone === "success" ? theme.colors.success :
      tone === "warning" ? theme.colors.warning :
        tone === "danger" ? theme.colors.danger :
          tone === "info" ? theme.colors.info :
            theme.colors.accentMuted;
  return (
    <Box flexDirection="row" marginBottom={1} backgroundColor={theme.colors.surfaceRaised} width="100%">
      <Box width={1} flexShrink={0} backgroundColor={accent} />
      <Box flexDirection="column" flexGrow={1} paddingX={2}>
        {children}
      </Box>
    </Box>
  );
}

export function ContextDrawer({
  attachments,
  skills,
  mcpServers,
  mcpTools = [],
  mcpReady = false,
  activeTab,
  query,
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
  const policy = usePolicyStatus({
    workspaceRoot,
    pollMs: activeTab === "policy" ? 5000 : 0,
  });
  const audit = useAuditVerify({
    pollMs: activeTab === "trace" ? 5000 : 0,
  });
  const traceEvents = runtime.events
    .filter((event) => event.type.startsWith("trace.") || event.type.startsWith("tool.call") || event.type === "error.raised")
    .slice(0, 10);
  const healthyMcp = mcpServers.filter((server) => server.healthy).length;
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  const width = Math.max(24, Math.min(Math.max(24, cols - 4), Math.max(52, Math.floor(cols * 0.72)), 96));
  const height = Math.min(Math.max(13, rows - 8), 24);
  const visibleAttachments = attachments.filter((item) => matchesQuery(query, item.kind, item.path));
  const visibleSkills = skills.filter((skill) => matchesQuery(query, skill.name, skill.description, skill.active));
  const visibleMcpServers = mcpServers.filter((server) => {
    const toolCount = mcpTools.filter((tool) => tool.server === server.name).length;
    return matchesQuery(query, server.name, server.health, server.error, toolCount);
  });
  const visibleTasks = runtime.tasks.filter((task) => matchesQuery(query, task.id, task.title, task.status, task.subagentId));
  const visibleSubagents = runtime.subagents.filter((subagent) => matchesQuery(query, subagent.id, subagent.role, subagent.status, subagent.model, subagent.taskId));
  const visibleMemoryHits = runtime.memoryHits.filter((memory) => matchesQuery(query, memory.id, memory.query, memory.count, ...(memory.topItems ?? [])));
  const visibleTraceEvents = traceEvents.filter((event) => matchesQuery(query, event.eventId, event.type));
  const visibleSessions = sessions.filter((session) => matchesQuery(query, session.id, session.updatedAt, session.current));

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      backgroundColor={theme.colors.surfaceOverlay}
      paddingX={3}
      paddingY={2}
    >
      <Box justifyContent="space-between">
        <Text bold color={theme.colors.fg}>{TAB_TITLE[activeTab]}</Text>
        <Text dimColor color={theme.colors.textTertiary}>type to search</Text>
      </Box>

      <Box flexDirection="row" marginTop={1} backgroundColor={theme.colors.surfaceSunken} width="100%">
        <Box width={1} backgroundColor={theme.colors.brand} />
        <Box paddingX={2} height={1} overflow="hidden">
          <Text color={theme.colors.textTertiary}>Search </Text>
          <Text color={query ? theme.colors.fg : theme.colors.textTertiary} wrap="truncate-end">
            {query || "filter current panel"}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingY={1}>
        {activeTab === "attachments" && (
          <Box flexDirection="column">
            {visibleAttachments.length === 0 ? (
              <EmptyState text={query ? "No context matches" : "No files attached"} theme={theme} />
            ) : (
              visibleAttachments.map((attachment, index) => (
                <DrawerRow key={`att-${index}`} theme={theme} tone="info">
                  <Box>
                    <StatusPill label={attachment.kind} tone="info" theme={theme} />
                    <Text color={theme.colors.textSecondary} wrap="truncate-end"> {short(attachment.path, 28)}</Text>
                  </Box>
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "skills" && (
          <Box flexDirection="column">
            {visibleSkills.length === 0 ? (
              <EmptyState text={query ? "No skills match" : "No skills discovered"} theme={theme} />
            ) : (
              visibleSkills.map((skill, index) => (
                <DrawerRow key={`skill-${index}`} theme={theme} tone={skill.active ? "success" : "neutral"}>
                  <Box>
                    <StatusPill label={skill.active ? "on" : "off"} tone={skill.active ? "success" : "neutral"} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(skill.name, 26)}</Text>
                  </Box>
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "mcp" && (
          <Box flexDirection="column">
            {!mcpReady ? (
              <DrawerRow theme={theme} tone="warning">
                <Box>
                  <Spinner active color={theme.colors.warning} />
                  <Text color={theme.colors.warning} bold> Starting MCP servers</Text>
                </Box>
                {mcpServers.length > 0 && (
                  <Box>
                    <ProgressBar value={healthyMcp} total={mcpServers.length} width={16} theme={theme} tone="warning" />
                    <Text color={theme.colors.textTertiary}> {healthyMcp}/{mcpServers.length}</Text>
                  </Box>
                )}
              </DrawerRow>
            ) : visibleMcpServers.length === 0 ? (
              <EmptyState text={query ? "No MCP servers match" : "No MCP servers configured"} theme={theme} />
            ) : (
              <>
                {visibleMcpServers.map((server) => {
                  const toolCount = mcpTools.filter((tool) => tool.server === server.name).length;
                  const health = server.health ?? (server.healthy ? "healthy" : "unhealthy");
                  return (
                    <DrawerRow key={`mcp-${server.name}`} theme={theme} tone={server.healthy ? "success" : "danger"}>
                      <Box>
                        <StatusPill label={server.healthy ? "OK" : "ERR"} tone={server.healthy ? "success" : "danger"} theme={theme} />
                        <Text color={theme.colors.textSecondary}> {short(server.name, 18)}</Text>
                      </Box>
                      <Text dimColor color={theme.colors.textTertiary}>
                        {toolCount} tools, {health}
                      </Text>
                      {server.error && (
                        <Text dimColor color={theme.colors.danger}>
                          {short(server.error, 34)}
                        </Text>
                      )}
                    </DrawerRow>
                  );
                })}
                <Box justifyContent="space-between">
                  <Text dimColor color={theme.colors.textTertiary}>Total: {mcpTools.length} tools</Text>
                </Box>
              </>
            )}
          </Box>
        )}

        {activeTab === "tasks" && (
          <Box flexDirection="column">
            {visibleTasks.length === 0 ? (
              <EmptyState text={query ? "No tasks match" : "No active tasks"} theme={theme} />
            ) : (
              visibleTasks.slice(0, 12).map((task) => (
                <DrawerRow key={`task-${task.id}`} theme={theme} tone={statusPillTone(task.status)}>
                  <Box>
                    <StatusPill label={task.status} tone={statusPillTone(task.status)} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(task.title, 22)}</Text>
                  </Box>
                  <Text dimColor color={theme.colors.textTertiary}>id: {short(task.id, 28)}</Text>
                  {task.subagentId && <Text dimColor color={theme.colors.textTertiary}>subagent: {short(task.subagentId, 24)}</Text>}
                  {task.progress && (
                    <Box>
                      <ProgressBar value={task.progress.done} total={task.progress.total} width={16} theme={theme} tone="info" />
                      <Text color={theme.colors.textTertiary}> {task.progress.done}/{task.progress.total}</Text>
                    </Box>
                  )}
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "subagents" && (
          <Box flexDirection="column">
            {visibleSubagents.length === 0 ? (
              <EmptyState text={query ? "No agents match" : "No runtime subagents"} theme={theme} />
            ) : (
              visibleSubagents.slice(0, 12).map((subagent) => (
                <DrawerRow key={`sg-${subagent.id}`} theme={theme} tone={statusPillTone(subagent.status)}>
                  <Box>
                    <StatusPill label={subagent.status} tone={statusPillTone(subagent.status)} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(subagent.role, 22)}</Text>
                  </Box>
                  <Text dimColor color={theme.colors.textTertiary}>id: {short(subagent.id, 28)}</Text>
                  {subagent.taskId && <Text dimColor color={theme.colors.textTertiary}>task: {short(subagent.taskId, 24)}</Text>}
                  {subagent.model && <Text dimColor color={theme.colors.textTertiary}>model: {short(subagent.model, 24)}</Text>}
                  {subagent.contextUsage !== undefined && (
                    <Box>
                      <ProgressBar value={Math.round(subagent.contextUsage * 100)} total={100} width={16} theme={theme} tone="warning" />
                      <Text color={theme.colors.textTertiary}> {Math.round(subagent.contextUsage * 100)}%</Text>
                    </Box>
                  )}
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "memory" && (
          <Box flexDirection="column">
            {visibleMemoryHits.length === 0 ? (
              <EmptyState text={query ? "No memory hits match" : "No memory recalls yet"} theme={theme} />
            ) : (
              visibleMemoryHits.slice(0, 10).map((memory) => (
                <DrawerRow key={`mem-${memory.id}`} theme={theme} tone="info">
                  <Text color={theme.colors.memory}>query: {short(memory.query, 26)}</Text>
                  <Text dimColor color={theme.colors.textTertiary}>items: {memory.count}</Text>
                  {(memory.topItems ?? []).slice(0, 2).map((item, index) => (
                    <Text key={`${memory.id}_${index}`} dimColor color={theme.colors.textTertiary}>
                      - {short(item, 28)}
                    </Text>
                  ))}
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "policy" && (
          <Box flexDirection="column">
            <DrawerRow theme={theme} tone={statusPillTone(policy.pdpHealthStatus)}>
              <Text color={theme.colors.brand}>bundle: {policy.bundleId}</Text>
              <Box>
                <StatusPill label={policy.pdpHealthStatus} tone={statusPillTone(policy.pdpHealthStatus)} theme={theme} />
                <Text color={statusTone(policy.pdpHealthStatus, theme)}> {policy.transport}</Text>
              </Box>
              <Text dimColor color={theme.colors.textTertiary}>signature: {policy.signatureStatus}</Text>
              <Text dimColor color={theme.colors.textTertiary}>sandbox: {policy.sandboxProfile}</Text>
              <Text dimColor color={theme.colors.textTertiary}>airisk: {policy.airiskLatencyMsDisplay}</Text>
            </DrawerRow>
            <Text dimColor color={theme.colors.textTertiary}>
              approvals: pending {policy.pendingApprovals}, persisted {policy.persistedApprovalRecords}
            </Text>
            {policy.failClosedLikely && (
              <Text color={theme.colors.warning}>fail-closed likely (degraded PDP)</Text>
            )}
            {policy.error && <Text color={theme.colors.danger}>error: {short(policy.error, 28)}</Text>}
          </Box>
        )}

        {activeTab === "trace" && (
          <Box flexDirection="column">
            <DrawerRow theme={theme} tone={statusPillTone(audit.chainStatus)}>
              <Box>
                <StatusPill label={audit.chainStatus} tone={statusPillTone(audit.chainStatus)} theme={theme} />
                <Text color={statusTone(audit.chainStatus, theme)}> ledger</Text>
              </Box>
              <Text dimColor color={theme.colors.textTertiary}>
                segment: {audit.segmentId ?? "none"} ({String(audit.entryCount ?? 0)} entries)
              </Text>
              <Text dimColor color={theme.colors.textTertiary}>spans open: {runtime.traceSpansOpen}</Text>
              <Text dimColor color={theme.colors.textTertiary}>pending approvals: {runtime.pendingApprovals}</Text>
              <Text dimColor color={theme.colors.textTertiary}>remote anchor: {short(audit.remoteAnchorStatus, 26)}</Text>
            </DrawerRow>
            {audit.error && <Text color={theme.colors.danger}>verify error: {short(audit.error, 26)}</Text>}
            <Text color={theme.colors.brand}>recent events</Text>
            {visibleTraceEvents.length === 0 ? (
              <EmptyState text={query ? "No trace events match" : "No trace events"} theme={theme} />
            ) : (
              visibleTraceEvents.map((event) => (
                <Text key={event.eventId} dimColor color={theme.colors.textTertiary}>
                  - {short(event.type, 32)}
                </Text>
              ))
            )}
          </Box>
        )}

        {activeTab === "sessions" && (
          <Box flexDirection="column">
            {visibleSessions.length === 0 ? (
              <EmptyState text={query ? "No sessions match" : "No local sessions"} theme={theme} />
            ) : (
              visibleSessions.slice(0, 12).map((session) => (
                <DrawerRow key={`sess-${session.id}`} theme={theme} tone={session.current ? "success" : "neutral"}>
                  <Box>
                    <StatusPill label={session.current ? "current" : "saved"} tone={session.current ? "success" : "neutral"} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(session.id, 20)}</Text>
                  </Box>
                  <Text dimColor color={theme.colors.textTertiary}>{short(session.updatedAt, 30)}</Text>
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "config" && (
          <Box flexDirection="column">
            <DrawerRow theme={theme} tone="info">
              <Text color={theme.colors.brand}>theme: {themeName}</Text>
              <Text dimColor color={theme.colors.textTertiary}>mouse: {mouseEnabled ? "on" : "off"}</Text>
              <Text dimColor color={theme.colors.textTertiary}>details: {detailsLevel}</Text>
              <Text dimColor color={theme.colors.textTertiary}>thinking: {thinkingMode}</Text>
              <Text dimColor color={theme.colors.textTertiary}>diff: {diffStyle}</Text>
            </DrawerRow>
            <Text dimColor color={theme.colors.textTertiary}>events: {runtime.events.length}</Text>
            <Text dimColor color={theme.colors.textTertiary}>run: {short(runtime.runId, 26)}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
