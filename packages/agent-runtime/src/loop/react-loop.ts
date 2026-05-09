import type { RunEvent } from "@kirakira/event-store";
import { ulid } from "ulid";

import { CostGuard } from "./cost-guard.js";
import { isExitCondition } from "./exit-conditions.js";
import { TurnManager } from "./turn-manager.js";
import { InterruptHandler } from "../interrupt/interrupt-handler.js";
import { handleToolResult } from "../tools/tool-result-handler.js";
import type { Action, ReactWorkerState } from "../types.js";
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
}

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
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "tool.call.started",
        payload: { toolName: action.toolName, args: action.args },
      });
      const result = await deps.toolExecutor.execute(action.toolName ?? "", action.args ?? {});
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
        payload: { toolName: action.toolName, preview: processed.content.slice(0, 2000) },
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
      turnManager.completeTurn(
        turn,
        action,
        { content: action.output ?? "delegate: subagent execution pending upstream" },
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      );
      state = turnManager.applyState({ ...state });
      yield await emitEvent(deps.eventWriter, {
        runId: state.config.runId,
        kind: "subagent.spawned",
        payload: { hint: action.output },
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
