import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  ApprovalDecision,
  EnqueuePromptRequest,
  InspectRunRequest,
  ProvideRunInputRequest,
  ResumeRunRequest,
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
  RuntimeMcpListRequest,
  RuntimeMcpListResult,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  RuntimeTransportEvent,
  RuntimeTransportStatus,
  SteerRunRequest,
  SubmitPromptRequest,
  SubscribeRunOptions,
} from "@kirakira/frontend-core";
import {
  DESKTOP_COMMAND_CHANNELS,
  KIRAKIRA_PRELOAD_API_KEY,
  RUNTIME_IPC_CHANNELS,
} from "./preload-contract.js";

type EventCallback = (event: RuntimeTransportEvent) => void;
type CommandPaletteOpenCallback = () => void;

const nextSubscriptionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `subscription-${Date.now()}-${Math.random()}`;

contextBridge.exposeInMainWorld(KIRAKIRA_PRELOAD_API_KEY, {
  connect: () => ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.connect) as Promise<void>,
  disconnect: () => ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.disconnect) as Promise<void>,
  getStatus: () =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.getStatus) as Promise<RuntimeTransportStatus>,
  submitPrompt: (request: SubmitPromptRequest) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.submitPrompt, request) as Promise<{ runId: string }>,
  getState: (runId: string) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.getState, runId) as Promise<{
      runId: string;
      state: unknown;
    }>,
  getArtifactContent: (request: RuntimeArtifactContentRequest) =>
    ipcRenderer.invoke(
      RUNTIME_IPC_CHANNELS.getArtifactContent,
      request,
    ) as Promise<RuntimeArtifactContent>,
  listMcpTools: (request?: RuntimeMcpListRequest) =>
    ipcRenderer.invoke(
      RUNTIME_IPC_CHANNELS.listMcpTools,
      request ?? {},
    ) as Promise<RuntimeMcpListResult>,
  callMcpTool: (request: RuntimeMcpToolCallRequest) =>
    ipcRenderer.invoke(
      RUNTIME_IPC_CHANNELS.callMcpTool,
      request,
    ) as Promise<RuntimeMcpToolCallResult>,
  subscribeRun: (
    runId: string,
    options: SubscribeRunOptions | undefined,
    callback: EventCallback,
  ) => {
    const subscriptionId = nextSubscriptionId();
    const channel = `runtime:event:${subscriptionId}`;
    const listener = (_event: IpcRendererEvent, payload: RuntimeTransportEvent) => {
      callback(payload);
    };
    ipcRenderer.on(channel, listener);
    void ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.subscribeRun, {
      runId,
      options,
      subscriptionId,
    });
    return () => {
      ipcRenderer.removeListener(channel, listener);
      void ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.unsubscribeRun, { subscriptionId });
    };
  },
  approve: (decision: ApprovalDecision) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.approve, decision) as Promise<void>,
  steer: (request: SteerRunRequest) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.steer, request) as Promise<void>,
  enqueue: (request: EnqueuePromptRequest) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.enqueue, request) as Promise<void>,
  provideInput: (request: ProvideRunInputRequest) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.provideInput, request) as Promise<void>,
  resume: (request: ResumeRunRequest) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.resume, request) as Promise<void>,
  inspect: (request: InspectRunRequest) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.inspect, request) as Promise<{
      runId: string;
      state: unknown;
    }>,
  cancel: (runId: string, reason?: string) =>
    ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.cancel, { runId, reason }) as Promise<void>,
  drain: () => ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.drain) as Promise<void>,
  onOpenCommandPalette: (callback: CommandPaletteOpenCallback) => {
    const listener = () => {
      callback();
    };
    ipcRenderer.on(DESKTOP_COMMAND_CHANNELS.openCommandPalette, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_COMMAND_CHANNELS.openCommandPalette, listener);
    };
  },
});
