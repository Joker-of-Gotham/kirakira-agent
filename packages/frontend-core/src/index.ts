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
  RunDashboardStatus,
  RuntimeEventSummary,
} from "./projection.js";
