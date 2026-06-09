import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  ApprovalDecision,
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  RuntimeTransportEvent,
  RuntimeTransportStatus,
  SubmitPromptRequest,
  SubscribeRunOptions,
} from "@kirakira/frontend-core";

type EventCallback = (event: RuntimeTransportEvent) => void;

const nextSubscriptionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `subscription-${Date.now()}-${Math.random()}`;

contextBridge.exposeInMainWorld("kirakiraRuntime", {
  connect: () => ipcRenderer.invoke("runtime:connect") as Promise<void>,
  disconnect: () => ipcRenderer.invoke("runtime:disconnect") as Promise<void>,
  getStatus: () => ipcRenderer.invoke("runtime:getStatus") as Promise<RuntimeTransportStatus>,
  submitPrompt: (request: SubmitPromptRequest) =>
    ipcRenderer.invoke("runtime:submitPrompt", request) as Promise<{ runId: string }>,
  getState: (runId: string) =>
    ipcRenderer.invoke("runtime:getState", runId) as Promise<{ runId: string; state: unknown }>,
  getArtifactContent: (request: RuntimeArtifactContentRequest) =>
    ipcRenderer.invoke("runtime:getArtifactContent", request) as Promise<RuntimeArtifactContent>,
  callMcpTool: (request: RuntimeMcpToolCallRequest) =>
    ipcRenderer.invoke("runtime:callMcpTool", request) as Promise<RuntimeMcpToolCallResult>,
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
    void ipcRenderer.invoke("runtime:subscribeRun", { runId, options, subscriptionId });
    return () => {
      ipcRenderer.removeListener(channel, listener);
      void ipcRenderer.invoke("runtime:unsubscribeRun", { subscriptionId });
    };
  },
  approve: (decision: ApprovalDecision) =>
    ipcRenderer.invoke("runtime:approve", decision) as Promise<void>,
  cancel: (runId: string, reason?: string) =>
    ipcRenderer.invoke("runtime:cancel", { runId, reason }) as Promise<void>,
  drain: () => ipcRenderer.invoke("runtime:drain") as Promise<void>,
});
