import type {
  RuntimeTransport,
  RuntimeTransportEvent,
  RuntimeTransportStatus,
  SubscribeRunOptions,
  Unsubscribe,
} from "@kirakira/frontend-core";

const unavailableDesktopStatus = (): RuntimeTransportStatus => ({
  mode: "desktop-ipc",
  state: "unavailable",
  label: "Desktop IPC",
  detail: "Desktop status check failed",
});

export function createDesktopRuntimeTransport(): RuntimeTransport | null {
  const bridge = window.kirakiraRuntime;
  if (!bridge) return null;

  return {
    mode: "desktop-ipc",
    connect: () => bridge.connect(),
    disconnect: () => {
      void bridge.disconnect();
    },
    getStatus: () => bridge.getStatus().catch(unavailableDesktopStatus),
    submitPrompt: (request) => bridge.submitPrompt(request),
    getState: (runId) => bridge.getState(runId),
    subscribeRun(
      runId: string,
      onEvent: (event: RuntimeTransportEvent) => void,
      options?: SubscribeRunOptions,
    ): Unsubscribe {
      return bridge.subscribeRun(runId, options, onEvent);
    },
    approve: (decision) => bridge.approve(decision),
    cancel: (runId, reason) => bridge.cancel(runId, reason),
    drain: () => bridge.drain(),
  };
}
