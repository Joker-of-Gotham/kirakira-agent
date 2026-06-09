export type {
  ControlMessage,
  EventFilter,
  RunEvent,
  RuntimeRunMode as RunMode,
  RuntimeRunOptions as RunOptions,
} from "@kirakira/runtime-contracts";

export type { WorkerSummary } from "@kirakira/agent-runtime";

export type {
  ApprovalSummary,
  CostInfo,
  RunStateSnapshot,
  TaskGraphSummary,
} from "./snapshot.js";
export { buildRunStateSnapshot } from "./snapshot.js";

export type { ClientMessage, ServerMessage } from "./server/protocol.js";
export {
  parseClientMessage,
  parseServerMessage,
  safeJsonStringify,
} from "./server/protocol.js";

export { DaemonClient } from "./client/daemon-client.js";
export { EventSubscriber } from "./client/event-subscriber.js";

export type { UdsServerOptions } from "./server/uds-server.js";
export { UdsServer } from "./server/uds-server.js";
export type {
  BrowserGatewayConfig,
  BrowserGatewayListenInfo,
  BrowserGatewayServerOptions,
} from "./server/browser-gateway-server.js";
export {
  BrowserGatewayServer,
  DEFAULT_BROWSER_GATEWAY_HOST,
  DEFAULT_BROWSER_GATEWAY_PATH,
  DEFAULT_BROWSER_GATEWAY_PORT,
} from "./server/browser-gateway-server.js";
export type { RuntimeSocketServerOptions } from "./server/runtime-socket.js";
export { RuntimeSocketHub } from "./server/runtime-socket.js";

export type { Session, SessionSubscription } from "./server/session-manager.js";
export { SessionManager } from "./server/session-manager.js";

export { eventMatchesSubscription } from "./server/event-utils.js";

export type { DaemonSocketPathOptions } from "./ipc/socket-path.js";
export {
  daemonSocketWebSocketUrl,
  isWindowsNamedPipePath,
  resolveDaemonSocketPath,
} from "./ipc/socket-path.js";

export { KernelBridge } from "./bridge/kernel-bridge.js";
export { RuntimeBridge } from "./bridge/runtime-bridge.js";
export type {
  DaemonMcpRuntimeOptions,
  DaemonMcpToolCallInput,
} from "./bridge/mcp-runtime.js";
export { DaemonMcpRuntime } from "./bridge/mcp-runtime.js";
export type {
  DaemonDeepResearchCompositionInput,
  DaemonDeepResearchOptions,
  DaemonMemoryResearchSourceOptions,
} from "./bridge/deep-research.js";
export { createDaemonDeepResearchKernelOptions } from "./bridge/deep-research.js";

export type { ChildProcessHandle, ProcessInfo } from "./lifecycle/process-manager.js";
export { ProcessManager } from "./lifecycle/process-manager.js";

export type { GatewayBridgeOptions } from "./bridge/gateway-bridge.js";
export { GatewayBridge } from "./bridge/gateway-bridge.js";

export type { DaemonConfig, HealthStatus } from "./lifecycle/daemon-lifecycle.js";
export { DaemonLifecycle } from "./lifecycle/daemon-lifecycle.js";

export { registerShutdownHandlers } from "./lifecycle/graceful-shutdown.js";

export type { DaemonConfigFromEnvOptions, DaemonEnv } from "./bin/daemon-config.js";
export {
  browserGatewayConfigFromEnv,
  daemonConfigFromEnv,
  kernelOptionsFromResolvedConfig,
  loadDaemonResolvedConfig,
  truthyDaemonEnv,
} from "./bin/daemon-config.js";
