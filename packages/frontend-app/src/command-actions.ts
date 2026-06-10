import type {
  RunWorkstreamAttentionItem,
  RuntimeMcpDirectoryTool,
  WorkbenchViewId,
} from "@kirakira/frontend-core";

export type WorkbenchCommandKind =
  | "steer_run"
  | "enqueue_prompt"
  | "provide_input"
  | "resume_run"
  | "inspect_run"
  | "open_view"
  | "open_attention"
  | "open_approval"
  | "approve_gate"
  | "open_artifact"
  | "open_mcp_tool"
  | "call_mcp_tool";

export type WorkbenchCommandTone = "neutral" | "success" | "warning" | "critical";

export interface WorkbenchCommandViewItem {
  readonly id: WorkbenchViewId;
  readonly label: string;
  readonly status?: string;
  readonly selected?: boolean;
}

export interface WorkbenchCommandDrafts {
  readonly steerInstruction?: string;
  readonly enqueuePrompt?: string;
  readonly interruptId?: string;
}

export interface WorkbenchCommandActionContext {
  readonly runId?: string;
  readonly activeView: WorkbenchViewId;
  readonly views: readonly WorkbenchCommandViewItem[];
  readonly attention: readonly RunWorkstreamAttentionItem[];
  readonly pendingApprovalId?: string;
  readonly activeArtifactId?: string;
  readonly activeArtifactTitle?: string;
  readonly selectedMcpTool?: RuntimeMcpDirectoryTool;
  readonly commandBusy?: boolean;
  readonly drafts?: WorkbenchCommandDrafts;
}

export interface WorkbenchCommandAction {
  readonly id: string;
  readonly kind: WorkbenchCommandKind;
  readonly group: string;
  readonly label: string;
  readonly detail?: string;
  readonly keywords: readonly string[];
  readonly tone: WorkbenchCommandTone;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly viewId?: WorkbenchViewId;
  readonly targetId?: string;
  readonly focusId?: string;
}

export function createWorkbenchCommandActions(
  context: WorkbenchCommandActionContext,
): WorkbenchCommandAction[] {
  const runRequiredReason = context.runId ? undefined : "Run ID required";
  const busyReason = context.commandBusy ? "Runtime command in progress" : undefined;
  const runtimeBlockedReason = busyReason ?? runRequiredReason;
  const interruptId = context.drafts?.interruptId?.trim();
  const topAttention = context.attention.slice(0, 4);
  const actions: WorkbenchCommandAction[] = [
    {
      id: "run.steer",
      kind: "steer_run",
      group: "Run",
      label: "Steer run",
      detail: context.drafts?.steerInstruction?.trim() || "Send steering guidance to the active run",
      keywords: ["run", "steer", "guidance", "instruction", context.runId ?? ""],
      tone: "neutral",
      disabled: Boolean(runtimeBlockedReason),
      disabledReason: runtimeBlockedReason,
    },
    {
      id: "run.enqueue",
      kind: "enqueue_prompt",
      group: "Run",
      label: "Queue prompt",
      detail: context.drafts?.enqueuePrompt?.trim() || "Append a prompt to the active run",
      keywords: ["run", "enqueue", "prompt", "queue", context.runId ?? ""],
      tone: "neutral",
      disabled: Boolean(runtimeBlockedReason),
      disabledReason: runtimeBlockedReason,
    },
    {
      id: "run.provide-input",
      kind: "provide_input",
      group: "Run",
      label: "Provide interrupt input",
      detail: interruptId ? `Interrupt ${interruptId}` : "Interrupt ID required",
      keywords: ["run", "interrupt", "input", "resume", context.runId ?? "", interruptId ?? ""],
      tone: interruptId ? "warning" : "neutral",
      disabled: Boolean(runtimeBlockedReason ?? (interruptId ? undefined : "Interrupt ID required")),
      disabledReason: runtimeBlockedReason ?? (interruptId ? undefined : "Interrupt ID required"),
    },
    {
      id: "run.resume",
      kind: "resume_run",
      group: "Run",
      label: "Resume run",
      detail: "Continue the active run",
      keywords: ["run", "resume", "continue", context.runId ?? ""],
      tone: "success",
      disabled: Boolean(runtimeBlockedReason),
      disabledReason: runtimeBlockedReason,
    },
    {
      id: "run.inspect",
      kind: "inspect_run",
      group: "Run",
      label: "Inspect run",
      detail: "Refresh runtime state for the active run",
      keywords: ["run", "inspect", "status", "refresh", context.runId ?? ""],
      tone: "neutral",
      disabled: Boolean(busyReason ?? runRequiredReason),
      disabledReason: busyReason ?? runRequiredReason,
    },
  ];

  for (const view of context.views) {
    actions.push({
      id: `view.${view.id}`,
      kind: "open_view",
      group: "Views",
      label: `Open ${view.label}`,
      detail: view.status ? `${view.status}${view.selected ? " selected" : ""}` : undefined,
      keywords: ["view", view.id, view.label, view.status ?? ""],
      tone: view.selected || context.activeView === view.id ? "success" : "neutral",
      viewId: view.id,
    });
  }

  for (const item of topAttention) {
    actions.push({
      id: `attention.${item.id}`,
      kind: "open_attention",
      group: "Attention",
      label: item.actionLabel || item.title,
      detail: item.detail || item.title,
      keywords: ["attention", item.severity, item.title, item.detail ?? "", item.id, item.itemId ?? ""],
      tone: attentionTone(item.severity),
      targetId: item.itemId ?? item.id,
      focusId: item.focusId,
    });
  }

  if (context.pendingApprovalId) {
    actions.push(
      {
        id: `approval.open.${context.pendingApprovalId}`,
        kind: "open_approval",
        group: "Gates",
        label: "Open approval gate",
        detail: context.pendingApprovalId,
        keywords: ["approval", "gate", "open", context.pendingApprovalId],
        tone: "warning",
        targetId: `approval:${context.pendingApprovalId}`,
        focusId: context.pendingApprovalId,
      },
      {
        id: `approval.approve.${context.pendingApprovalId}`,
        kind: "approve_gate",
        group: "Gates",
        label: "Approve gate",
        detail: context.pendingApprovalId,
        keywords: ["approval", "approve", "gate", context.pendingApprovalId],
        tone: "success",
        disabled: Boolean(runtimeBlockedReason),
        disabledReason: runtimeBlockedReason,
        targetId: context.pendingApprovalId,
      },
    );
  }

  if (context.activeArtifactId) {
    actions.push({
      id: `artifact.open.${context.activeArtifactId}`,
      kind: "open_artifact",
      group: "Artifacts",
      label: "Open active artifact",
      detail: context.activeArtifactTitle ?? context.activeArtifactId,
      keywords: ["artifact", "preview", "open", context.activeArtifactId, context.activeArtifactTitle ?? ""],
      tone: "neutral",
      focusId: `artifact:${context.activeArtifactId}`,
      targetId: context.activeArtifactId,
    });
  }

  if (context.selectedMcpTool) {
    const toolLabel = context.selectedMcpTool.title ?? context.selectedMcpTool.name;
    actions.push(
      {
        id: `mcp.open.${context.selectedMcpTool.id}`,
        kind: "open_mcp_tool",
        group: "MCP",
        label: "Open selected MCP tool",
        detail: `${toolLabel} on ${context.selectedMcpTool.server}`,
        keywords: ["mcp", "tool", "server", context.selectedMcpTool.id, toolLabel, context.selectedMcpTool.server],
        tone: "neutral",
        targetId: context.selectedMcpTool.id,
      },
      {
        id: `mcp.call.${context.selectedMcpTool.id}`,
        kind: "call_mcp_tool",
        group: "MCP",
        label: "Call selected MCP tool",
        detail: `${toolLabel} on ${context.selectedMcpTool.server}`,
        keywords: ["mcp", "call", "tool", context.selectedMcpTool.id, toolLabel, context.selectedMcpTool.server],
        tone: "warning",
        disabled: Boolean(context.commandBusy),
        disabledReason: busyReason,
        targetId: context.selectedMcpTool.id,
      },
    );
  }

  return actions;
}

export function filterWorkbenchCommandActions(
  actions: readonly WorkbenchCommandAction[],
  query: string,
): WorkbenchCommandAction[] {
  const normalizedQuery = normalizeCommandText(query);
  if (!normalizedQuery) {
    return [...actions];
  }
  const queryParts = normalizedQuery.split(" ").filter(Boolean);
  return actions.filter((action) => {
    const haystack = normalizeCommandText(
      [
        action.id,
        action.group,
        action.label,
        action.detail ?? "",
        action.viewId ?? "",
        action.targetId ?? "",
        action.focusId ?? "",
        ...action.keywords,
      ].join(" "),
    );
    return queryParts.every((part) => haystack.includes(part));
  });
}

function attentionTone(severity: RunWorkstreamAttentionItem["severity"]): WorkbenchCommandTone {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "neutral";
}

function normalizeCommandText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._:-]+/g, " ").trim();
}
