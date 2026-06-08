export type {
  ApprovalDecision,
  RuntimeConnectionState,
  RuntimeTransport,
  RuntimeTransportEvent,
  RuntimeTransportMode,
  RuntimeTransportSnapshot,
  SubmitPromptRequest,
  SubscribeRunOptions,
  Unsubscribe,
} from "./transport.js";
export type { BrowserGatewayTransportOptions } from "./browser-gateway-transport.js";
export { createBrowserGatewayTransport } from "./browser-gateway-transport.js";

export {
  createEmptyRunDashboard,
  projectRunDashboard,
  summarizeRunEvent,
} from "./projection.js";

export type {
  EntityPhase,
  ProjectionOptions,
  RunDashboardEntityMaps,
  RunDashboardProjection,
  RunDashboardResearchCitation,
  RunDashboardResearchRun,
  RunDashboardSubagent,
  RunDashboardStatus,
  RuntimeEventSummary,
} from "./projection.js";
