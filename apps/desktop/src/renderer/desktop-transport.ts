import type {
  RuntimeTransport,
  RuntimeTransportEvent,
  SubscribeRunOptions,
  Unsubscribe,
} from "@kirakira/frontend-core";

export function createDesktopRuntimeTransport(): RuntimeTransport | null {
  const bridge = window.kirakiraRuntime;
  if (!bridge) return null;

  return {
    mode: "desktop-ipc",
    connect: () => bridge.connect(),
    disconnect: () => {
      void bridge.disconnect();
    },
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
