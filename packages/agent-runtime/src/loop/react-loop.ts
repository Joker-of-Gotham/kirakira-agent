import type { RunEvent } from "@kirakira/event-store";
import { ulid } from "ulid";

import { CostGuard } from "./cost-guard.js";
import { isExitCondition } from "./exit-conditions.js";
import { TurnManager } from "./turn-manager.js";
import { InterruptHandler } from "../interrupt/interrupt-handler.js";
import { handleToolResult } from "../tools/tool-result-handler.js";
import type {
  Action,
  SandboxPolicyCeiling,
  SubagentCapability,
  SubagentRuntimePolicy,
  ReactWorkerState,
} from "../types.js";
import {
  runtimeCapabilityScopeFromConfig,
  scopeAllowsSkillName,
  scopeAllowsToolName,
} from "../runtime-scope.js";
import type { ModelClient } from "../model/model-client.js";
import type { ToolExecutor } from "../tools/tool-executor.js";
import type { SkillInjector } from "../context/skill-injector.js";
import type { ContextAssembler } from "../context/assembler.js";
import type { WorkspaceExecutor } from "../sandbox/workspace-executor.js";
import type { Workspace } from "../types.js";
import type { ArtifactStore } from "../sandbox/artifact-store.js";
import { StructuredOutputError } from "../errors.js";

export interface RuntimeDeps {
  modelClient: ModelClient;
  toolExecutor: ToolExecutor;
  skillInjector: SkillInjector;
  contextAssembler: ContextAssembler;
  workspaceExecutor: WorkspaceExecutor;
  eventWriter: {
    emit(event: RunEvent): Promise<void>;
  };
  workspace: Workspace;
  artifactStore?: ArtifactStore;
  delegateRunner?: DelegateRunner;
}

export interface DelegateRequest {
  subagentId: string;
  parentWorkerId: string;
  parentTaskId?: string;
  parentConfig: ReactWorkerState["config"];
  runId: string;
  task: string;
  capabilities?: SubagentCapability[];
  modelPreference?: string;
  policyCeiling?: SandboxPolicyCeiling;
  runtimePolicy?: SubagentRuntimePolicy;
  inputArtifactRefs?: string[];
  outputSchema?: Record<string, unknown>;
  action: Action & { kind: "delegate" };
}

export type DelegateResult =
  | {
      success: true;
      workerId: string;
      finalText: string;
      artifactRefs?: string[];
    }
  | {
      success: false;
      workerId?: string;
      error: string;
      artifactRefs?: string[];
    };

export type DelegateRunner = (request: DelegateRequest) => Promise<DelegateResult>;

const STEP_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    kind: { type: "string" },
    toolName: { type: "string" },
    args: { type: "object" },
    output: { type: "string" },
    skillName: { type: "string" },
    command: { type: "string" },
  },
  required: ["kind"],
};

interface StructuredStep {
  kind: string;
  toolName?: string;
  args?: Record<string, unknown>;
  output?: string;
  skillName?: string;
  command?: string;
}

function delegateTask(action: Action): string {
  const args = action.args ?? {};
  const fromArgs = args.task ?? args.brief ?? args.prompt ?? args.instruction;
  if (typeof fromArgs === "string" && fromArgs.trim().length > 0) {
    return fromArgs.trim();
  }
  return (action.output ?? "").trim();
}

function stringArg(action: Action, ...keys: string[]): string | undefined {
  const args = action.args ?? {};
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function stringArrayArg(action: Action, key: string): string[] | undefined {
  const value = action.args?.[key];
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function objectArg<T extends object>(action: Action, key: string): T | undefined {
  const value = action.args?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : undefined;
}

function delegateCapabilities(action: Action): SubagentCapability[] | undefined {
  const value = action.args?.capabilities;
  if (!Array.isArray(value)) return undefined;
  const out: SubagentCapability[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const kind = candidate.kind;
    const name = candidate.name;
    if (
      (kind === "tool" || kind === "skill" || kind === "mcp") &&
      typeof name === "string" &&
      name.trim().length > 0
    ) {
      out.push({ kind, name: name.trim() });
    }
  }
  return out;
}

function asAction(step: StructuredStep): Action {
  const k = step.kind;
  if (
    k !== "tool_call" &&
    k !== "skill_exec" &&
    k !== "sandbox_exec" &&
    k !== "final_output" &&
    k !== "delegate"
  ) {
    throw new StructuredOutputError(`Invalid step kind: ${String(k)}`);
  }
  return {
    kind: k,
    ...(step.toolName !== undefined ? { toolName: step.toolName } : {}),
    ...(step.args !== undefined ? { args: step.args } : {}),
    ...(step.output !== undefined ? { output: step.output } : {}),
  };
}

async function emitEvent(
  writer: RuntimeDeps["eventWriter"],
  ev: Omit<RunEvent, "id" | "timestamp"> & { id?: string; timestamp?: string },
): Promise<RunEvent> {
  const full: RunEvent = {
    id: ev.id ?? ulid(),
    runId: ev.runId,
    timestamp: ev.timestamp ?? new Date().toISOString(),
    kind: ev.kind,
    payload: ev.payload,
    ...(ev.parentRunId !== undefined ? { parentRunId: ev.parentRunId } : {}),
    ...(ev.checkpointSeq !== undefined ? { checkpointSeq: ev.checkpointSeq } : {}),
  };
  await writer.emit(full);
  return full;
}

export async function* reactLoop(
  initial: ReactWorkerState,
  deps: RuntimeDeps,
): AsyncGenerator<RunEvent> {
  let state: ReactWorkerState = { ...initial };
  const interrupt = new InterruptHandler();
  if (state.interruptRequested) {
    interrupt.requestInterrupt(state.interruptReason ?? "restored");
  }
  const costGuard = new CostGuard(state.config.costBudgetUsd);
  const turnManager = new TurnManager();
  turnManager.seedFromState(state);
  let consecutiveErrors = 0;

  yield await emitEvent(deps.eventWriter, {
    runId: state.config.runId,
    kind: "run.started",
    payload: { workerId: state.config.id },
  });

  while (!isExitCondition(state, { consecutiveErrors, maxConsecutiveErrors: 5 })) {
    if (interrupt.checkInterrupt(state)) {
      state = {
        ...state,
        status: "interrupted",
        interruptReason: interrupt.consumeReason() ?? state.interruptReason,
      };
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "interrupt.raised",
        payload: { workerId: state.config.id, reason: state.interruptReason },
      });
      return;
    }

    const workingSet = await deps.contextAssembler.assemble(state);
    yield await emitEvent(deps.eventWriter, {
      runId: state.config.runId,
      kind: "model.request",
      payload: { workerId: state.config.id, contextTokens: workingSet.totalTokenEstimate },
    });

    const turn = turnManager.startTurn();
    const step = await deps.modelClient.completeStructured<StructuredStep>(
      workingSet.messages,
      STEP_SCHEMA,
      {
        model: state.config.model,
        temperature: 0.2,
        maxTokens: 2048,
        onUsage: (u) => {
          costGuard.record(u, state.config.model);
          deps.contextAssembler.recordModelUsage(u);
          state = {
            ...state,
            totalTokensUsed: state.totalTokensUsed + u.totalTokens,
            totalCostUsd: costGuard.summary().totalCost,
          };
        },
      },
      workingSet.systemPrompt,
    );
    const action = asAction(step);

    yield await emitEvent(deps.eventWriter, {
      runId: state.config.runId,
      kind: "model.response",
      payload: { workerId: state.config.id, action },
    });

    if (action.kind === "final_output") {
      const obs = { content: action.output ?? "" };
      turnManager.completeTurn(turn, action, obs, {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
      state = turnManager.applyState({
        ...state,
        status: "completed",
      });
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "run.completed",
        payload: { workerId: state.config.id, output: obs.content },
      });
      return;
    }

    if (action.kind === "tool_call") {
      const toolName = action.toolName ?? "";
      const capabilityScope = runtimeCapabilityScopeFromConfig(state.config);
      if (!scopeAllowsToolName(capabilityScope, toolName)) {
        consecutiveErrors += 1;
        const content = `ERROR: tool_call denied by capability scope: ${toolName}`;
        turnManager.completeTurn(
          turn,
          action,
          { content, truncated: false },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        );
        state = turnManager.applyState({ ...state });
        yield await emitEvent(deps.eventWriter, {
          runId: state.config.runId,
          kind: "tool.call.failed",
          payload: { toolName, reason: "capability_scope_denied" },
        });
        continue;
      }
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "tool.call.started",
        payload: { toolName, args: action.args },
      });
      const result = await deps.toolExecutor.execute(toolName, action.args ?? {});
      const processed = handleToolResult(result, deps.workspace, deps.artifactStore);
      turnManager.completeTurn(turn, action, {
        content: processed.content,
        ...(processed.artifactRefs.length > 0 ? { artifactRefs: processed.artifactRefs } : {}),
        truncated: processed.truncated,
      });
      if (!result.success) consecutiveErrors += 1;
      else consecutiveErrors = 0;
      state = turnManager.applyState({
        ...state,
        artifacts: [
          ...new Set([...state.artifacts, ...processed.artifactRefs]),
        ],
        totalCostUsd: costGuard.summary().totalCost,
      });
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: result.success ? "tool.call.completed" : "tool.call.failed",
        payload: { toolName, preview: processed.content.slice(0, 2000) },
      });
      continue;
    }

    if (action.kind === "skill_exec") {
      const name = step.skillName ?? action.toolName;
      if (!name) {
        consecutiveErrors += 1;
        turnManager.completeTurn(
          turn,
          action,
          { content: "ERROR: skill_exec missing skillName", truncated: false },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        );
        state = turnManager.applyState({ ...state });
        continue;
      }
      const capabilityScope = runtimeCapabilityScopeFromConfig(state.config);
      if (!scopeAllowsSkillName(capabilityScope, name)) {
        consecutiveErrors += 1;
        turnManager.completeTurn(
          turn,
          action,
          { content: `ERROR: skill_exec denied by capability scope: ${name}`, truncated: false },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        );
        state = turnManager.applyState({ ...state });
        continue;
      }
      deps.skillInjector.promote(name, "loaded");
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "skill.loaded",
        payload: { skill: name },
      });
      const body = deps.skillInjector.getInjectionContent("loaded");
      turnManager.completeTurn(
        turn,
        action,
        { content: body.slice(0, 48_000), truncated: body.length > 48_000 },
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      );
      consecutiveErrors = 0;
      state = turnManager.applyState({ ...state });
      continue;
    }

    if (action.kind === "sandbox_exec") {
      const cmd = step.command ?? String(action.args?.command ?? "");
      if (!cmd) {
        consecutiveErrors += 1;
        turnManager.completeTurn(
          turn,
          action,
          { content: "ERROR: sandbox_exec missing command" },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        );
        state = turnManager.applyState({ ...state });
        continue;
      }
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "sandbox.opened",
        payload: { workerId: state.config.id, command: cmd },
      });
      const execRes = await deps.workspaceExecutor.execShell(cmd);
      const text = `exit:${execRes.exitCode}
stdout:
${execRes.stdout}
stderr:
${execRes.stderr}`;
      turnManager.completeTurn(turn, action, { content: text }, {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
      consecutiveErrors = execRes.exitCode === 0 ? 0 : consecutiveErrors + 1;
      state = turnManager.applyState({ ...state });
      continue;
    }

    if (action.kind === "delegate") {
      const delegateAction = action as Action & { kind: "delegate" };
      const task = delegateTask(delegateAction);
      const subagentId = ulid();
      const capabilities = delegateCapabilities(delegateAction);
      const modelPreference = stringArg(delegateAction, "modelPreference", "model");
      const runtimePolicy = objectArg<SubagentRuntimePolicy>(delegateAction, "runtimePolicy");
      const policyCeiling = objectArg<SandboxPolicyCeiling>(delegateAction, "policyCeiling");
      const inputArtifactRefs = stringArrayArg(delegateAction, "inputArtifactRefs");
      const outputSchema = objectArg<Record<string, unknown>>(delegateAction, "outputSchema");
      if (!task) {
        consecutiveErrors += 1;
        turnManager.completeTurn(
          turn,
          delegateAction,
          { content: "ERROR: delegate missing task", truncated: false },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        );
        state = turnManager.applyState({ ...state });
        yield await emitEvent(deps.eventWriter, {
          runId: state.config.runId,
          kind: "subagent.completed",
          payload: {
            subagentId,
            parentWorkerId: state.config.id,
            status: "failed",
            error: "delegate missing task",
          },
        });
        continue;
      }
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "subagent.spawned",
        payload: {
          subagentId,
          parentWorkerId: state.config.id,
          taskPreview: task.slice(0, 2000),
          ...(capabilities !== undefined ? { capabilities } : {}),
          ...(modelPreference !== undefined ? { modelPreference } : {}),
          ...(runtimePolicy !== undefined ? { runtimePolicy } : {}),
          ...(policyCeiling !== undefined ? { policyCeiling } : {}),
          ...(inputArtifactRefs !== undefined ? { inputArtifactRefs } : {}),
          ...(outputSchema !== undefined ? { outputSchema } : {}),
        },
      });
      if (!deps.delegateRunner) {
        consecutiveErrors += 1;
        turnManager.completeTurn(
          turn,
          delegateAction,
          { content: "ERROR: delegate runner unavailable", truncated: false },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        );
        state = turnManager.applyState({ ...state });
        yield await emitEvent(deps.eventWriter, {
          runId: state.config.runId,
          kind: "subagent.completed",
          payload: {
            subagentId,
            parentWorkerId: state.config.id,
            status: "failed",
            error: "delegate runner unavailable",
          },
        });
        continue;
      }
      let result: DelegateResult;
      try {
        result = await deps.delegateRunner({
          subagentId,
          parentWorkerId: state.config.id,
          parentConfig: state.config,
          runId: state.config.runId,
          task,
          ...(capabilities !== undefined ? { capabilities } : {}),
          ...(modelPreference !== undefined ? { modelPreference } : {}),
          ...(runtimePolicy !== undefined ? { runtimePolicy } : {}),
          ...(policyCeiling !== undefined ? { policyCeiling } : {}),
          ...(inputArtifactRefs !== undefined ? { inputArtifactRefs } : {}),
          ...(outputSchema !== undefined ? { outputSchema } : {}),
          action: delegateAction,
        });
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (!result.success) {
        consecutiveErrors += 1;
        turnManager.completeTurn(
          turn,
          delegateAction,
          {
            content: `ERROR: subagent ${result.workerId ?? subagentId} failed: ${result.error}`,
            ...(result.artifactRefs && result.artifactRefs.length > 0
              ? { artifactRefs: result.artifactRefs }
              : {}),
            truncated: false,
          },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        );
        state = turnManager.applyState({
          ...state,
          artifacts: [
            ...new Set([...state.artifacts, ...(result.artifactRefs ?? [])]),
          ],
        });
        yield await emitEvent(deps.eventWriter, {
          runId: state.config.runId,
          kind: "subagent.completed",
          payload: {
            subagentId,
            workerId: result.workerId,
            parentWorkerId: state.config.id,
            status: "failed",
            error: result.error,
            ...(result.artifactRefs && result.artifactRefs.length > 0
              ? { artifactRefs: result.artifactRefs }
              : {}),
          },
        });
        continue;
      }
      const finalText = result.finalText;
      turnManager.completeTurn(
        turn,
        delegateAction,
        {
          content: finalText,
          ...(result.artifactRefs && result.artifactRefs.length > 0
            ? { artifactRefs: result.artifactRefs }
            : {}),
          truncated: false,
        },
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      );
      consecutiveErrors = 0;
      state = turnManager.applyState({
        ...state,
        artifacts: [
          ...new Set([...state.artifacts, ...(result.artifactRefs ?? [])]),
        ],
      });
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "subagent.completed",
        payload: {
          subagentId,
          workerId: result.workerId,
          parentWorkerId: state.config.id,
          status: "completed",
          preview: finalText.slice(0, 2000),
          ...(result.artifactRefs && result.artifactRefs.length > 0
            ? { artifactRefs: result.artifactRefs }
            : {}),
        },
      });
      continue;
    }
  }

  state = { ...state, status: "completed" };
  yield await emitEvent(deps.eventWriter, {
    runId: state.config.runId,
    kind: "run.completed",
    payload: { workerId: state.config.id, reason: "exit_condition" },
  });
}
