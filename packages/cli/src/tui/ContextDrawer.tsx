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
  nativeTool?: string;
  description?: string;
  riskLevel: string;
  readOnly?: boolean;
  inputSchema?: Record<string, unknown>;
}

interface ContextDrawerProps {
  attachments: Attachment[];
  skills: SkillEntry[];
  mcpServers: McpServerStatus[];
  mcpTools?: McpToolSummary[];
  mcpReady?: boolean;
  activeTab: InspectorTab;
  query: string;
  selectedIndex?: number;
  detailIndex?: number;
  runtime: RuntimeStoreState;
  sessions: SessionListItem[];
  workspaceRoot: string;
  themeName: string;
  detailsLevel: ToolDetailsLevel;
  thinkingMode: ThinkingDisplayMode;
  mouseEnabled: boolean;
  diffStyle: string;
  theme: TuiTheme;
  detailOpen?: boolean;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function schemaSummary(schema: Record<string, unknown> | undefined): string {
  const props = asRecord(schema?.properties);
  const keys = props ? Object.keys(props) : [];
  if (keys.length === 0) return "schema: no declared inputs";
  return `schema: ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? "..." : ""}`;
}

function windowAround<T>(items: T[], selected: number, maxItems: number): { items: T[]; start: number } {
  if (items.length <= maxItems) return { items, start: 0 };
  const half = Math.floor(maxItems / 2);
  const start = Math.max(0, Math.min(selected - half, items.length - maxItems));
  return { items: items.slice(start, start + maxItems), start };
}

function EmptyState({ text, theme }: { text: string; theme: TuiTheme }): React.ReactElement {
  return <Text dimColor color={theme.colors.textTertiary}>{text}</Text>;
}

function DrawerRow({
  children,
  theme,
  tone = "neutral",
  selected = false,
}: {
  children: React.ReactNode;
  theme: TuiTheme;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  selected?: boolean;
}): React.ReactElement {
  const accent =
    selected ? theme.colors.brand :
      tone === "success" ? theme.colors.success :
        tone === "warning" ? theme.colors.warning :
          tone === "danger" ? theme.colors.danger :
            tone === "info" ? theme.colors.info :
              theme.colors.accentMuted;
  return (
    <Box
      flexDirection="row"
      marginBottom={1}
      minHeight={2}
      backgroundColor={selected ? theme.colors.surfaceOverlay : theme.colors.surfaceRaised}
      width="100%"
    >
      <Box width={1} flexShrink={0} backgroundColor={accent} />
      <Box width={2} flexShrink={0} justifyContent="center">
        <Text color={selected ? theme.colors.brand : theme.colors.textTertiary}>{selected ? ">" : " "}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingX={2} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}

function DetailPane({
  title,
  lines,
  theme,
}: {
  title: string;
  lines: string[];
  theme: TuiTheme;
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      width="100%"
      paddingX={2}
      paddingY={1}
      backgroundColor={theme.colors.surfaceSunken}
      overflow="hidden"
    >
      <Text color={theme.colors.brand} bold wrap="truncate-end">{title}</Text>
      {lines.slice(0, 8).map((line, index) => (
        <Text key={`detail_${index}`} color={index === 0 ? theme.colors.textSecondary : theme.colors.textTertiary} wrap="truncate-end">
          {line || " "}
        </Text>
      ))}
    </Box>
  );
}

function McpDetailView({
  server,
  tools,
  detailIndex,
  theme,
}: {
  server: McpServerStatus;
  tools: McpToolSummary[];
  detailIndex: number;
  theme: TuiTheme;
}): React.ReactElement {
  const selected = tools[Math.min(detailIndex, Math.max(0, tools.length - 1))];
  const visible = windowAround(tools, detailIndex, 5);
  const health = server.health ?? (server.healthy ? "healthy" : "unhealthy");

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" width="100%">
      <Box flexDirection="column" paddingX={2} paddingY={1} backgroundColor={theme.colors.surfaceSunken} marginBottom={1}>
        <Text color={theme.colors.brand} bold wrap="truncate-end">{server.name}</Text>
        <Text color={theme.colors.textSecondary} wrap="truncate-end">
          status: {health}  transport: {server.transport}  tools: {tools.length}
        </Text>
        {server.error && <Text color={theme.colors.danger} wrap="truncate-end">error: {server.error}</Text>}
      </Box>

      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
        {tools.length === 0 ? (
          <EmptyState text="No tools reported by this server" theme={theme} />
        ) : (
          visible.items.map((tool, index) => {
            const absoluteIndex = visible.start + index;
            const isSelected = absoluteIndex === detailIndex;
            return (
              <DrawerRow key={`${tool.server}_${tool.alias}`} theme={theme} tone={tool.readOnly ? "success" : "warning"} selected={isSelected}>
                <Box justifyContent="space-between" width="100%">
                  <Text color={theme.colors.textSecondary} bold={isSelected} wrap="truncate-end">
                    {short(tool.alias, 42)}
                  </Text>
                  <Text color={tool.readOnly ? theme.colors.success : theme.colors.warning}>
                    {tool.readOnly ? "read" : "write"}  {tool.riskLevel}
                  </Text>
                </Box>
                <Text dimColor color={theme.colors.textTertiary} wrap="truncate-end">
                  {short(tool.description ?? tool.nativeTool ?? "No description", 86)}
                </Text>
                {isSelected && (
                  <Text dimColor color={theme.colors.textTertiary} wrap="truncate-end">
                    native: {tool.nativeTool ?? tool.alias}  {schemaSummary(tool.inputSchema)}
                  </Text>
                )}
              </DrawerRow>
            );
          })
        )}
      </Box>

      {selected && (
        <Box flexShrink={0} paddingX={2} paddingY={1} backgroundColor={theme.colors.surfaceSunken}>
          <Text color={theme.colors.textSecondary} wrap="truncate-end">
            {selected.alias}: {selected.description ?? "No description"}
          </Text>
        </Box>
      )}
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
  selectedIndex = 0,
  detailIndex = 0,
  runtime,
  sessions,
  workspaceRoot,
  themeName,
  detailsLevel,
  thinkingMode,
  mouseEnabled,
  diffStyle,
  theme,
  detailOpen = false,
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
  const width = Math.max(44, Math.min(Math.max(44, cols - 8), Math.max(76, Math.floor(cols * 0.82)), 136));
  const height = Math.min(Math.max(18, rows - 6), 34);
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
  const selectedMcp = visibleMcpServers[Math.min(selectedIndex, Math.max(0, visibleMcpServers.length - 1))];
  const selectedSession = visibleSessions[Math.min(selectedIndex, Math.max(0, visibleSessions.length - 1))];
  const selectedTask = visibleTasks[Math.min(selectedIndex, Math.max(0, visibleTasks.length - 1))];
  const selectedSubagent = visibleSubagents[Math.min(selectedIndex, Math.max(0, visibleSubagents.length - 1))];
  const selectedAttachment = visibleAttachments[Math.min(selectedIndex, Math.max(0, visibleAttachments.length - 1))];
  const selectedSkill = visibleSkills[Math.min(selectedIndex, Math.max(0, visibleSkills.length - 1))];
  const selectedMemory = visibleMemoryHits[Math.min(selectedIndex, Math.max(0, visibleMemoryHits.length - 1))];
  const selectedTrace = visibleTraceEvents[Math.min(selectedIndex, Math.max(0, visibleTraceEvents.length - 1))];
  const selectedMcpTools = selectedMcp ? mcpTools.filter((tool) => tool.server === selectedMcp.name) : [];
  const mcpDetailOpen = activeTab === "mcp" && detailOpen && Boolean(selectedMcp);
  const detailTitle =
    activeTab === "sessions" && selectedSession ? short(selectedSession.id, 44) :
      activeTab === "tasks" && selectedTask ? selectedTask.title :
        activeTab === "subagents" && selectedSubagent ? selectedSubagent.role :
          activeTab === "attachments" && selectedAttachment ? selectedAttachment.path :
            activeTab === "skills" && selectedSkill ? selectedSkill.name :
              activeTab === "memory" && selectedMemory ? selectedMemory.query :
                activeTab === "trace" && selectedTrace ? selectedTrace.type :
                  activeTab === "mcp" && selectedMcp ? selectedMcp.name :
                    `${TAB_TITLE[activeTab]} details`;
  const detailLines =
    activeTab === "sessions" && selectedSession ? [
      selectedSession.current ? "current session" : "saved session",
      `updated: ${selectedSession.updatedAt}`,
      "Enter again to resume this session",
    ] :
      activeTab === "tasks" && selectedTask ? [
        `status: ${selectedTask.status}`,
        `id: ${selectedTask.id}`,
        selectedTask.subagentId ? `subagent: ${selectedTask.subagentId}` : "",
        selectedTask.progress ? `progress: ${selectedTask.progress.done}/${selectedTask.progress.total}` : "",
      ].filter((line): line is string => Boolean(line)) :
        activeTab === "subagents" && selectedSubagent ? [
          `status: ${selectedSubagent.status}`,
          `id: ${selectedSubagent.id}`,
          selectedSubagent.model ? `model: ${selectedSubagent.model}` : "",
          selectedSubagent.taskId ? `task: ${selectedSubagent.taskId}` : "",
        ].filter((line): line is string => Boolean(line)) :
          activeTab === "attachments" && selectedAttachment ? [
            `kind: ${selectedAttachment.kind}`,
            `path: ${selectedAttachment.path}`,
          ] :
            activeTab === "skills" && selectedSkill ? [
              selectedSkill.active ? "active" : "inactive",
              selectedSkill.description,
            ] :
              activeTab === "memory" && selectedMemory ? [
                `items: ${selectedMemory.count}`,
                ...(selectedMemory.topItems ?? []),
              ] :
                activeTab === "trace" && selectedTrace ? [
                  `id: ${selectedTrace.eventId}`,
                  `type: ${selectedTrace.type}`,
                  `time: ${selectedTrace.ts}`,
                ] :
                  activeTab === "config" ? [
                    `theme: ${themeName}`,
                    `mouse: ${mouseEnabled ? "on" : "off"}`,
                    `details: ${detailsLevel}`,
                    `thinking: ${thinkingMode}`,
                    `diff: ${diffStyle}`,
                  ] :
                    activeTab === "policy" ? [
                      `bundle: ${policy.bundleId}`,
                      `pdp: ${policy.pdpHealthStatus}`,
                      `transport: ${policy.transport}`,
                      `signature: ${policy.signatureStatus}`,
                    ] : ["No detail available"];

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      backgroundColor={theme.colors.surfaceRaised}
      paddingX={5}
      paddingY={3}
    >
      <Box justifyContent="space-between">
        <Text bold color={theme.colors.fg}>{mcpDetailOpen ? "MCP Tools" : TAB_TITLE[activeTab]}</Text>
        <Text dimColor color={theme.colors.textTertiary}>{mcpDetailOpen ? "server detail" : "type to search"}</Text>
      </Box>

      <Box flexDirection="row" marginTop={2} marginBottom={1} backgroundColor={theme.colors.surfaceSunken} width="100%" height={3}>
        <Box width={1} backgroundColor={theme.colors.brand} />
        <Box paddingX={2} paddingY={1} height={3} overflow="hidden" flexGrow={1}>
          <Text color={theme.colors.textTertiary}>{mcpDetailOpen ? "Server " : "Search "}</Text>
          <Text color={query || mcpDetailOpen ? theme.colors.fg : theme.colors.textTertiary} wrap="truncate-end">
            {mcpDetailOpen && selectedMcp ? selectedMcp.name : query || "filter current panel"}
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
                <DrawerRow key={`att-${index}`} theme={theme} tone="info" selected={index === selectedIndex}>
                  <Box>
                    <StatusPill label={attachment.kind} tone="info" theme={theme} />
                    <Text color={theme.colors.textSecondary} wrap="truncate-end"> {short(attachment.path, 58)}</Text>
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
                <DrawerRow key={`skill-${index}`} theme={theme} tone={skill.active ? "success" : "neutral"} selected={index === selectedIndex}>
                  <Box>
                    <StatusPill label={skill.active ? "on" : "off"} tone={skill.active ? "success" : "neutral"} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(skill.name, 48)}</Text>
                  </Box>
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "mcp" && (
          mcpDetailOpen && selectedMcp ? (
            <McpDetailView server={selectedMcp} tools={selectedMcpTools} detailIndex={detailIndex} theme={theme} />
          ) : (
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
                  {visibleMcpServers.map((server, index) => {
                    const toolCount = mcpTools.filter((tool) => tool.server === server.name).length;
                    const health = server.health ?? (server.healthy ? "healthy" : "unhealthy");
                    return (
                      <DrawerRow key={`mcp-${server.name}`} theme={theme} tone={server.healthy ? "success" : "danger"} selected={index === selectedIndex}>
                        <Box justifyContent="space-between" width="100%">
                          <Box>
                            <StatusPill label={server.healthy ? "OK" : "ERR"} tone={server.healthy ? "success" : "danger"} theme={theme} />
                            <Text color={theme.colors.textSecondary}> {short(server.name, 42)}</Text>
                          </Box>
                          <Text dimColor color={theme.colors.textTertiary}>
                            {toolCount} tools, {health}
                          </Text>
                        </Box>
                        {server.error && <Text dimColor color={theme.colors.danger}>{short(server.error, 54)}</Text>}
                      </DrawerRow>
                    );
                  })}
                  <Box justifyContent="space-between">
                    <Text dimColor color={theme.colors.textTertiary}>Total: {mcpTools.length} tools</Text>
                  </Box>
                </>
              )}
            </Box>
          )
        )}

        {activeTab === "tasks" && (
          <Box flexDirection="column">
            {visibleTasks.length === 0 ? (
              <EmptyState text={query ? "No tasks match" : "No active tasks"} theme={theme} />
            ) : (
              visibleTasks.slice(0, 12).map((task, index) => (
                <DrawerRow key={`task-${task.id}`} theme={theme} tone={statusPillTone(task.status)} selected={index === selectedIndex}>
                  <Box>
                    <StatusPill label={task.status} tone={statusPillTone(task.status)} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(task.title, 32)}</Text>
                  </Box>
                  <Text dimColor color={theme.colors.textTertiary}>id: {short(task.id, 32)}</Text>
                  {task.subagentId && <Text dimColor color={theme.colors.textTertiary}>subagent: {short(task.subagentId, 28)}</Text>}
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
              visibleSubagents.slice(0, 12).map((subagent, index) => (
                <DrawerRow key={`sg-${subagent.id}`} theme={theme} tone={statusPillTone(subagent.status)} selected={index === selectedIndex}>
                  <Box>
                    <StatusPill label={subagent.status} tone={statusPillTone(subagent.status)} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(subagent.role, 32)}</Text>
                  </Box>
                  <Text dimColor color={theme.colors.textTertiary}>id: {short(subagent.id, 32)}</Text>
                  {subagent.taskId && <Text dimColor color={theme.colors.textTertiary}>task: {short(subagent.taskId, 28)}</Text>}
                  {subagent.model && <Text dimColor color={theme.colors.textTertiary}>model: {short(subagent.model, 28)}</Text>}
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
              visibleMemoryHits.slice(0, 10).map((memory, index) => (
                <DrawerRow key={`mem-${memory.id}`} theme={theme} tone="info" selected={index === selectedIndex}>
                  <Text color={theme.colors.memory}>query: {short(memory.query, 42)}</Text>
                  <Text dimColor color={theme.colors.textTertiary}>items: {memory.count}</Text>
                  {(memory.topItems ?? []).slice(0, 2).map((item, itemIndex) => (
                    <Text key={`${memory.id}_${itemIndex}`} dimColor color={theme.colors.textTertiary}>
                      - {short(item, 48)}
                    </Text>
                  ))}
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "policy" && (
          <Box flexDirection="column">
            <DrawerRow theme={theme} tone={statusPillTone(policy.pdpHealthStatus)} selected={selectedIndex === 0}>
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
            {policy.failClosedLikely && <Text color={theme.colors.warning}>fail-closed likely (degraded PDP)</Text>}
            {policy.error && <Text color={theme.colors.danger}>error: {short(policy.error, 42)}</Text>}
          </Box>
        )}

        {activeTab === "trace" && (
          <Box flexDirection="column">
            <DrawerRow theme={theme} tone={statusPillTone(audit.chainStatus)} selected={selectedIndex === 0}>
              <Box>
                <StatusPill label={audit.chainStatus} tone={statusPillTone(audit.chainStatus)} theme={theme} />
                <Text color={statusTone(audit.chainStatus, theme)}> ledger</Text>
              </Box>
              <Text dimColor color={theme.colors.textTertiary}>
                segment: {audit.segmentId ?? "none"} ({String(audit.entryCount ?? 0)} entries)
              </Text>
              <Text dimColor color={theme.colors.textTertiary}>spans open: {runtime.traceSpansOpen}</Text>
              <Text dimColor color={theme.colors.textTertiary}>pending approvals: {runtime.pendingApprovals}</Text>
              <Text dimColor color={theme.colors.textTertiary}>remote anchor: {short(audit.remoteAnchorStatus, 42)}</Text>
            </DrawerRow>
            {audit.error && <Text color={theme.colors.danger}>verify error: {short(audit.error, 42)}</Text>}
            <Text color={theme.colors.brand}>recent events</Text>
            {visibleTraceEvents.length === 0 ? (
              <EmptyState text={query ? "No trace events match" : "No trace events"} theme={theme} />
            ) : (
              visibleTraceEvents.map((event, index) => (
                <DrawerRow key={event.eventId} theme={theme} tone="neutral" selected={index === selectedIndex}>
                  <Text dimColor color={theme.colors.textTertiary}>{short(event.type, 54)}</Text>
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "sessions" && (
          <Box flexDirection="column">
            {visibleSessions.length === 0 ? (
              <EmptyState text={query ? "No sessions match" : "No local sessions"} theme={theme} />
            ) : (
              visibleSessions.slice(0, 12).map((session, index) => (
                <DrawerRow key={`sess-${session.id}`} theme={theme} tone={session.current ? "success" : "neutral"} selected={index === selectedIndex}>
                  <Box>
                    <StatusPill label={session.current ? "current" : "saved"} tone={session.current ? "success" : "neutral"} theme={theme} />
                    <Text color={theme.colors.textSecondary}> {short(session.id, 28)}</Text>
                  </Box>
                  <Text dimColor color={theme.colors.textTertiary}>{short(session.updatedAt, 40)}</Text>
                </DrawerRow>
              ))
            )}
          </Box>
        )}

        {activeTab === "config" && (
          <Box flexDirection="column">
            <DrawerRow theme={theme} tone="info" selected={selectedIndex === 0}>
              <Text color={theme.colors.brand}>theme: {themeName}</Text>
              <Text dimColor color={theme.colors.textTertiary}>mouse: {mouseEnabled ? "on" : "off"}</Text>
              <Text dimColor color={theme.colors.textTertiary}>details: {detailsLevel}</Text>
              <Text dimColor color={theme.colors.textTertiary}>thinking: {thinkingMode}</Text>
              <Text dimColor color={theme.colors.textTertiary}>diff: {diffStyle}</Text>
            </DrawerRow>
            <Text dimColor color={theme.colors.textTertiary}>events: {runtime.events.length}</Text>
            <Text dimColor color={theme.colors.textTertiary}>run: {short(runtime.runId, 36)}</Text>
          </Box>
        )}
      </Box>

      {detailOpen && !mcpDetailOpen && (
        <Box marginTop={1} marginBottom={1} flexShrink={0}>
          <DetailPane title={detailTitle} lines={detailLines} theme={theme} />
        </Box>
      )}

      <Box justifyContent="space-between" height={1} overflow="hidden">
        <Text color={theme.colors.textTertiary}>
          {mcpDetailOpen ? "Up/Down tools" : "Up/Down move  Enter details"}
        </Text>
        <Text color={theme.colors.textTertiary}>
          {activeTab === "sessions" && detailOpen ? "Enter resume  Esc back" : detailOpen ? "Esc back" : "Esc close"}
        </Text>
      </Box>
    </Box>
  );
}
