import type { RuntimeEndpointParts } from "./endpoint.js";
import {
  MEMORY_RUN_EVENT_KINDS,
  isRunEventKind,
  type RunEventKind,
} from "./events.js";
import {
  DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES,
  RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES,
} from "./artifact-content.js";

export type RuntimeHealthState = "healthy" | "unavailable" | "disabled";
export type RuntimeCapabilityState = "enabled" | "available" | "disabled";

export type RuntimeCapabilityId =
  | "control"
  | "event_stream"
  | "state_snapshot"
  | "approvals"
  | "artifacts"
  | "checkpoints"
  | "subagents"
  | "deep_research"
  | "memory"
  | "mcp";

export interface RuntimeCapabilityRecord {
  id: RuntimeCapabilityId;
  state: RuntimeCapabilityState;
  summary: string;
  eventKinds?: RunEventKind[];
  clientMessageTypes?: string[];
  limits?: Record<string, string | number | boolean>;
}

export interface RuntimeMcpServerManifest {
  name: string;
  command: string;
  args?: string[];
  envKeys?: string[];
}

export interface RuntimeMcpManifest {
  profileName?: string;
  serverGroups?: string[];
  servers: RuntimeMcpServerManifest[];
  catalog?: {
    defaultServerGroups?: string[];
    groups?: Record<string, string[]>;
    servers?: string[];
  };
}

export type RuntimeOrchestrationLaneName =
  | "foreground"
  | "queued"
  | "background"
  | "delegated";

export type RuntimeOrchestrationHandoffMode = "tool" | "supervisor" | "swarm";
export type RuntimeOrchestrationContextMode = "isolated" | "filtered" | "inherit";

export interface RuntimeOrchestrationLaneManifest {
  capacity?: number;
}

export interface RuntimeOrchestrationRoleManifest {
  id: string;
  description?: string;
  lane?: RuntimeOrchestrationLaneName;
  model?: string;
  maxTurns?: number;
  context?: RuntimeOrchestrationContextMode;
  toolScope?: string[];
  skillScope?: string[];
  mcpServers?: string[];
  permissionLabels?: string[];
}

export interface RuntimeOrchestrationHandoffManifest {
  from: string;
  to: string;
  mode?: RuntimeOrchestrationHandoffMode;
  inputFilter?: string;
  approvalRequired?: boolean;
  conditions?: string[];
}

export interface RuntimeOrchestrationManifest {
  profileName?: string;
  handoffMode?: RuntimeOrchestrationHandoffMode;
  defaultRole?: string;
  lanes?: Partial<Record<RuntimeOrchestrationLaneName, RuntimeOrchestrationLaneManifest>>;
  roles?: RuntimeOrchestrationRoleManifest[];
  handoffs?: RuntimeOrchestrationHandoffManifest[];
}

export interface RuntimeManifest {
  schemaVersion: 1;
  runtime: "kirakira-agent";
  contract: {
    protocol: "runtime-v1";
    eventSchemaVersion: 1;
  };
  endpoints: {
    socketPath?: string;
    browserGateway?: {
      endpoint: RuntimeEndpointParts;
      tokenRequired: boolean;
    };
  };
  capabilities: Record<RuntimeCapabilityId, RuntimeCapabilityRecord>;
  mcp?: RuntimeMcpManifest;
  orchestration?: RuntimeOrchestrationManifest;
  security: {
    loopbackRecommended: true;
    secretsRedacted: true;
    explicitToolConsentRequired: true;
  };
}

export type RuntimeCapabilityOverrides = Partial<
  Record<
    RuntimeCapabilityId,
    Partial<Omit<RuntimeCapabilityRecord, "id">>
  >
>;

export interface RuntimeServiceHealth {
  ok: boolean;
  state: RuntimeHealthState;
  message?: string;
}

export interface RuntimeSocketHealth extends RuntimeServiceHealth {
  socketPath?: string;
}

export interface RuntimeBrowserGatewayServiceHealth extends RuntimeServiceHealth {
  endpoint?: RuntimeEndpointParts;
  tokenRequired?: boolean;
}

export interface RuntimeDaemonHealth {
  schemaVersion: 1;
  ok: boolean;
  gateway: boolean;
  kernel: boolean;
  socket: boolean;
  browserGateway: boolean;
  services: {
    gateway: RuntimeServiceHealth;
    kernel: RuntimeServiceHealth;
    socket: RuntimeSocketHealth;
    browserGateway: RuntimeBrowserGatewayServiceHealth;
  };
  details: {
    socketPath?: string;
    browserGateway?: {
      endpoint: RuntimeEndpointParts;
      tokenRequired: boolean;
    };
    manifest: RuntimeManifest;
  };
}

export interface RuntimeBrowserGatewayHealth {
  schemaVersion: 1;
  ok: boolean;
  transport: "browser-gateway";
  endpoint: RuntimeEndpointParts;
  tokenRequired: boolean;
  manifest: RuntimeManifest;
}

const DEFAULT_CAPABILITIES: Record<RuntimeCapabilityId, RuntimeCapabilityRecord> = {
  control: {
    id: "control",
    state: "enabled",
    summary: "Submit, steer, cancel, resume, drain, approve, and inspect runtime runs.",
    clientMessageTypes: ["control", "ping"],
  },
  event_stream: {
    id: "event_stream",
    state: "enabled",
    summary: "Subscribe to typed run events with replay checkpoints.",
    clientMessageTypes: ["subscribe", "unsubscribe"],
    eventKinds: [
      "run.created",
      "run.started",
      "run.completed",
      "run.failed",
      "run.drained",
      "task.ready",
      "task.started",
      "task.completed",
      "task.failed",
    ],
  },
  state_snapshot: {
    id: "state_snapshot",
    state: "enabled",
    summary: "Fetch typed run state snapshots for web and desktop workbenches.",
    clientMessageTypes: ["get_state"],
  },
  approvals: {
    id: "approvals",
    state: "available",
    summary: "Represent human approval requests and decisions in the runtime event stream.",
    eventKinds: ["approval.requested", "approval.resolved"],
  },
  artifacts: {
    id: "artifacts",
    state: "available",
    summary: "Expose generated artifact metadata and bounded content previews.",
    eventKinds: ["artifact.created", "artifact.updated"],
    clientMessageTypes: ["get_artifact"],
    limits: {
      defaultPreviewBytes: DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES,
      hardMaxPreviewBytes: RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES,
    },
  },
  checkpoints: {
    id: "checkpoints",
    state: "available",
    summary: "Persist graph checkpoints for resumable orchestrator execution.",
    eventKinds: ["checkpoint.saved"],
  },
  subagents: {
    id: "subagents",
    state: "available",
    summary: "Delegate bounded work to subagent runtimes through explicit capability scopes.",
    eventKinds: ["subagent.spawned", "subagent.completed"],
  },
  deep_research: {
    id: "deep_research",
    state: "available",
    summary: "Run source-grounded research tasks over pluggable source adapters.",
    eventKinds: [
      "research.started",
      "research.plan.created",
      "research.task.started",
      "research.task.completed",
      "research.task.failed",
      "research.source.started",
      "research.source.completed",
      "research.source.failed",
      "research.evidence.collected",
      "research.citation.added",
      "research.limit.reached",
      "research.completed",
      "research.failed",
    ],
  },
  memory: {
    id: "memory",
    state: "available",
    summary: "Attach durable memory recall, retain, reflect, and checkpoint planes through injected runtime services.",
    eventKinds: [...MEMORY_RUN_EVENT_KINDS],
  },
  mcp: {
    id: "mcp",
    state: "available",
    summary: "Expose MCP tools, resources, prompts, audit metadata, and consent state as capabilities.",
  },
};

export function runtimeServiceHealth(
  ok: boolean,
  options: { disabled?: boolean; message?: string } = {},
): RuntimeServiceHealth {
  const state: RuntimeHealthState = options.disabled
    ? "disabled"
    : ok
      ? "healthy"
      : "unavailable";
  return {
    ok: options.disabled ? false : ok,
    state,
    ...(options.message ? { message: options.message } : {}),
  };
}

export function runtimeBrowserGatewayHealth(input: {
  endpoint: RuntimeEndpointParts;
  tokenRequired: boolean;
  manifest?: RuntimeManifest;
}): RuntimeBrowserGatewayHealth {
  const manifest =
    input.manifest ??
    runtimeManifest({
      browserGateway: {
        endpoint: input.endpoint,
        tokenRequired: input.tokenRequired,
      },
    });
  return {
    schemaVersion: 1,
    ok: true,
    transport: "browser-gateway",
    endpoint: input.endpoint,
    tokenRequired: input.tokenRequired,
    manifest,
  };
}

export function runtimeDaemonHealth(input: {
  gateway: boolean;
  kernel: boolean;
  socket: boolean;
  socketPath?: string;
  browserGateway?: {
    endpoint: RuntimeEndpointParts;
    tokenRequired: boolean;
  };
  capabilities?: RuntimeCapabilityOverrides;
  mcp?: RuntimeMcpManifest;
  orchestration?: RuntimeOrchestrationManifest;
}): RuntimeDaemonHealth {
  const gateway = runtimeServiceHealth(input.gateway);
  const kernel = runtimeServiceHealth(input.kernel);
  const socket = {
    ...runtimeServiceHealth(input.socket),
    ...(input.socketPath ? { socketPath: input.socketPath } : {}),
  };
  const browserGateway = input.browserGateway
    ? {
        ...runtimeServiceHealth(true),
        endpoint: input.browserGateway.endpoint,
        tokenRequired: input.browserGateway.tokenRequired,
      }
    : runtimeServiceHealth(false, { disabled: true });
  const manifest = runtimeManifest({
    socketPath: input.socketPath,
    browserGateway: input.browserGateway,
    capabilities: input.capabilities,
    mcp: input.mcp,
    orchestration: input.orchestration,
  });
  return {
    schemaVersion: 1,
    ok: gateway.ok && kernel.ok && socket.ok,
    gateway: gateway.ok,
    kernel: kernel.ok,
    socket: socket.ok,
    browserGateway: browserGateway.ok,
    services: {
      gateway,
      kernel,
      socket,
      browserGateway,
    },
    details: {
      ...(input.socketPath ? { socketPath: input.socketPath } : {}),
      ...(input.browserGateway
        ? {
        browserGateway: {
          endpoint: input.browserGateway.endpoint,
          tokenRequired: input.browserGateway.tokenRequired,
        },
      }
        : {}),
      manifest,
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isEndpointParts = (value: unknown): value is RuntimeEndpointParts =>
  isRecord(value) &&
  typeof value.protocol === "string" &&
  typeof value.host === "string" &&
  typeof value.port === "number" &&
  typeof value.path === "string" &&
  typeof value.url === "string" &&
  typeof value.origin === "string";

function sanitizeEndpointParts(endpoint: RuntimeEndpointParts): RuntimeEndpointParts {
  return {
    protocol: endpoint.protocol,
    host: endpoint.host,
    port: endpoint.port,
    path: endpoint.path,
    url: endpoint.url,
    origin: endpoint.origin,
  };
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? items : undefined;
}

function sanitizeRuntimeMcpServer(server: RuntimeMcpServerManifest): RuntimeMcpServerManifest {
  return {
    name: server.name,
    command: server.command,
    ...(stringArray(server.args) ? { args: stringArray(server.args) } : {}),
    ...(stringArray(server.envKeys) ? { envKeys: stringArray(server.envKeys) } : {}),
  };
}

function sanitizeRuntimeMcpManifest(mcp: RuntimeMcpManifest): RuntimeMcpManifest {
  return {
    ...(typeof mcp.profileName === "string" ? { profileName: mcp.profileName } : {}),
    ...(stringArray(mcp.serverGroups) ? { serverGroups: stringArray(mcp.serverGroups) } : {}),
    servers: mcp.servers.map(sanitizeRuntimeMcpServer),
    ...(mcp.catalog
      ? {
          catalog: {
            ...(stringArray(mcp.catalog.defaultServerGroups)
              ? { defaultServerGroups: stringArray(mcp.catalog.defaultServerGroups) }
              : {}),
            ...(mcp.catalog.groups
              ? {
                  groups: Object.fromEntries(
                    Object.entries(mcp.catalog.groups)
                      .map(([name, members]) => [name, stringArray(members)])
                      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1])),
                  ),
                }
              : {}),
            ...(stringArray(mcp.catalog.servers) ? { servers: stringArray(mcp.catalog.servers) } : {}),
          },
        }
      : {}),
  };
}

const ORCHESTRATION_LANES = new Set<RuntimeOrchestrationLaneName>([
  "foreground",
  "queued",
  "background",
  "delegated",
]);

const HANDOFF_MODES = new Set<RuntimeOrchestrationHandoffMode>([
  "tool",
  "supervisor",
  "swarm",
]);

const CONTEXT_MODES = new Set<RuntimeOrchestrationContextMode>([
  "isolated",
  "filtered",
  "inherit",
]);

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function optionalNonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function sanitizeRuntimeOrchestrationManifest(
  orchestration: RuntimeOrchestrationManifest,
): RuntimeOrchestrationManifest {
  const lanes =
    orchestration.lanes !== undefined
      ? Object.fromEntries(
          Object.entries(orchestration.lanes)
            .filter(([lane, value]) => ORCHESTRATION_LANES.has(lane as RuntimeOrchestrationLaneName) && isRecord(value))
            .map(([lane, value]) => {
              const capacity = optionalNonnegativeInteger(value.capacity);
              return [
                lane,
                {
                  ...(capacity !== undefined ? { capacity } : {}),
                },
              ];
            }),
        ) as Partial<Record<RuntimeOrchestrationLaneName, RuntimeOrchestrationLaneManifest>>
      : undefined;
  const roles = Array.isArray(orchestration.roles)
    ? orchestration.roles
        .filter((role) => isRecord(role) && typeof role.id === "string" && role.id.length > 0)
        .map((role) => {
          const lane = ORCHESTRATION_LANES.has(role.lane as RuntimeOrchestrationLaneName)
            ? role.lane as RuntimeOrchestrationLaneName
            : undefined;
          const context = CONTEXT_MODES.has(role.context as RuntimeOrchestrationContextMode)
            ? role.context as RuntimeOrchestrationContextMode
            : undefined;
          const maxTurns = optionalPositiveInteger(role.maxTurns);
          return {
            id: role.id,
            ...(typeof role.description === "string" ? { description: role.description } : {}),
            ...(lane !== undefined ? { lane } : {}),
            ...(typeof role.model === "string" ? { model: role.model } : {}),
            ...(maxTurns !== undefined ? { maxTurns } : {}),
            ...(context !== undefined ? { context } : {}),
            ...(stringArray(role.toolScope) ? { toolScope: stringArray(role.toolScope) } : {}),
            ...(stringArray(role.skillScope) ? { skillScope: stringArray(role.skillScope) } : {}),
            ...(stringArray(role.mcpServers) ? { mcpServers: stringArray(role.mcpServers) } : {}),
            ...(stringArray(role.permissionLabels)
              ? { permissionLabels: stringArray(role.permissionLabels) }
              : {}),
          };
        })
    : undefined;
  const handoffs = Array.isArray(orchestration.handoffs)
    ? orchestration.handoffs
        .filter((handoff) =>
          isRecord(handoff) &&
          typeof handoff.from === "string" &&
          handoff.from.length > 0 &&
          typeof handoff.to === "string" &&
          handoff.to.length > 0,
        )
        .map((handoff) => {
          const mode = HANDOFF_MODES.has(handoff.mode as RuntimeOrchestrationHandoffMode)
            ? handoff.mode as RuntimeOrchestrationHandoffMode
            : undefined;
          return {
            from: handoff.from,
            to: handoff.to,
            ...(mode !== undefined ? { mode } : {}),
            ...(typeof handoff.inputFilter === "string" ? { inputFilter: handoff.inputFilter } : {}),
            ...(typeof handoff.approvalRequired === "boolean"
              ? { approvalRequired: handoff.approvalRequired }
              : {}),
            ...(stringArray(handoff.conditions) ? { conditions: stringArray(handoff.conditions) } : {}),
          };
        })
    : undefined;
  const handoffMode = HANDOFF_MODES.has(orchestration.handoffMode as RuntimeOrchestrationHandoffMode)
    ? orchestration.handoffMode
    : undefined;
  return {
    ...(typeof orchestration.profileName === "string" ? { profileName: orchestration.profileName } : {}),
    ...(handoffMode !== undefined ? { handoffMode } : {}),
    ...(typeof orchestration.defaultRole === "string" ? { defaultRole: orchestration.defaultRole } : {}),
    ...(lanes !== undefined && Object.keys(lanes).length > 0 ? { lanes } : {}),
    ...(roles !== undefined && roles.length > 0 ? { roles } : {}),
    ...(handoffs !== undefined && handoffs.length > 0 ? { handoffs } : {}),
  };
}

export function runtimeManifest(input: {
  socketPath?: string;
  browserGateway?: {
    endpoint: RuntimeEndpointParts;
    tokenRequired: boolean;
  };
  capabilities?: RuntimeCapabilityOverrides;
  mcp?: RuntimeMcpManifest;
  orchestration?: RuntimeOrchestrationManifest;
} = {}): RuntimeManifest {
  const capabilities = Object.fromEntries(
    Object.entries(DEFAULT_CAPABILITIES).map(([id, record]) => {
      const capabilityId = id as RuntimeCapabilityId;
      const override = input.capabilities?.[capabilityId];
      return [
        capabilityId,
        {
          ...record,
          ...(override ?? {}),
          id: capabilityId,
        },
      ];
    }),
  ) as Record<RuntimeCapabilityId, RuntimeCapabilityRecord>;
  return {
    schemaVersion: 1,
    runtime: "kirakira-agent",
    contract: {
      protocol: "runtime-v1",
      eventSchemaVersion: 1,
    },
    endpoints: {
      ...(input.socketPath !== undefined ? { socketPath: input.socketPath } : {}),
      ...(input.browserGateway !== undefined
        ? {
            browserGateway: {
              endpoint: sanitizeEndpointParts(input.browserGateway.endpoint),
              tokenRequired: input.browserGateway.tokenRequired,
            },
          }
        : {}),
    },
    capabilities,
    ...(input.mcp !== undefined ? { mcp: sanitizeRuntimeMcpManifest(input.mcp) } : {}),
    ...(input.orchestration !== undefined
      ? { orchestration: sanitizeRuntimeOrchestrationManifest(input.orchestration) }
      : {}),
    security: {
      loopbackRecommended: true,
      secretsRedacted: true,
      explicitToolConsentRequired: true,
    },
  };
}

function sanitizeRuntimeCapability(
  capability: RuntimeCapabilityRecord,
): RuntimeCapabilityRecord {
  return {
    id: capability.id,
    state: capability.state,
    summary: capability.summary,
    ...(capability.eventKinds !== undefined
      ? { eventKinds: capability.eventKinds.filter(isRunEventKind) }
      : {}),
    ...(capability.clientMessageTypes !== undefined
      ? {
          clientMessageTypes: capability.clientMessageTypes.filter(
            (messageType) => typeof messageType === "string",
          ),
        }
      : {}),
    ...(capability.limits !== undefined
      ? {
          limits: Object.fromEntries(
            Object.entries(capability.limits).filter(([, value]) =>
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean",
            ),
          ),
        }
      : {}),
  };
}

export function sanitizeRuntimeManifest(manifest: RuntimeManifest): RuntimeManifest {
  if (!isRuntimeManifest(manifest)) {
    throw new Error("Runtime manifest response is invalid");
  }
  const capabilities = Object.fromEntries(
    Object.entries(manifest.capabilities).map(([id, capability]) => [
      id,
      sanitizeRuntimeCapability(capability),
    ]),
  ) as Record<RuntimeCapabilityId, RuntimeCapabilityRecord>;
  return {
    schemaVersion: 1,
    runtime: "kirakira-agent",
    contract: {
      protocol: "runtime-v1",
      eventSchemaVersion: 1,
    },
    endpoints: {
      ...(manifest.endpoints.socketPath !== undefined
        ? { socketPath: manifest.endpoints.socketPath }
        : {}),
      ...(manifest.endpoints.browserGateway !== undefined
        ? {
            browserGateway: {
              endpoint: sanitizeEndpointParts(manifest.endpoints.browserGateway.endpoint),
              tokenRequired: manifest.endpoints.browserGateway.tokenRequired,
            },
          }
        : {}),
    },
    capabilities,
    ...(manifest.mcp !== undefined ? { mcp: sanitizeRuntimeMcpManifest(manifest.mcp) } : {}),
    ...(manifest.orchestration !== undefined
      ? { orchestration: sanitizeRuntimeOrchestrationManifest(manifest.orchestration) }
      : {}),
    security: {
      loopbackRecommended: true,
      secretsRedacted: true,
      explicitToolConsentRequired: true,
    },
  };
}

function sanitizeServiceHealth(service: RuntimeServiceHealth): RuntimeServiceHealth {
  return {
    ok: service.ok,
    state: service.state,
    ...(service.message !== undefined ? { message: service.message } : {}),
  };
}

function sanitizeSocketHealth(service: RuntimeSocketHealth): RuntimeSocketHealth {
  return {
    ...sanitizeServiceHealth(service),
    ...(service.socketPath !== undefined ? { socketPath: service.socketPath } : {}),
  };
}

function sanitizeBrowserGatewayServiceHealth(
  service: RuntimeBrowserGatewayServiceHealth,
): RuntimeBrowserGatewayServiceHealth {
  return {
    ...sanitizeServiceHealth(service),
    ...(service.endpoint !== undefined
      ? { endpoint: sanitizeEndpointParts(service.endpoint) }
      : {}),
    ...(service.tokenRequired !== undefined ? { tokenRequired: service.tokenRequired } : {}),
  };
}

const isRuntimeServiceHealth = (value: unknown): value is RuntimeServiceHealth =>
  isRecord(value) &&
  typeof value.ok === "boolean" &&
  (value.state === "healthy" ||
    value.state === "unavailable" ||
    value.state === "disabled") &&
  (value.message === undefined || typeof value.message === "string");

const isRuntimeSocketHealth = (value: unknown): value is RuntimeSocketHealth => {
  if (!isRuntimeServiceHealth(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return record.socketPath === undefined || typeof record.socketPath === "string";
};

const isRuntimeBrowserGatewayServiceHealth = (
  value: unknown,
): value is RuntimeBrowserGatewayServiceHealth => {
  if (!isRuntimeServiceHealth(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return (
    (record.endpoint === undefined || isEndpointParts(record.endpoint)) &&
    (record.tokenRequired === undefined || typeof record.tokenRequired === "boolean")
  );
};

const isRuntimeCapabilityId = (value: unknown): value is RuntimeCapabilityId =>
  typeof value === "string" && value in DEFAULT_CAPABILITIES;

const isRuntimeCapabilityState = (value: unknown): value is RuntimeCapabilityState =>
  value === "enabled" || value === "available" || value === "disabled";

const isRuntimeCapabilityRecord = (
  value: unknown,
  expectedId?: string,
): value is RuntimeCapabilityRecord => {
  if (!isRecord(value)) return false;
  return (
    isRuntimeCapabilityId(value.id) &&
    (expectedId === undefined || value.id === expectedId) &&
    isRuntimeCapabilityState(value.state) &&
    typeof value.summary === "string" &&
    (value.eventKinds === undefined ||
      (Array.isArray(value.eventKinds) &&
        value.eventKinds.every(isRunEventKind))) &&
    (value.clientMessageTypes === undefined ||
      (Array.isArray(value.clientMessageTypes) &&
        value.clientMessageTypes.every((messageType) => typeof messageType === "string"))) &&
    (value.limits === undefined ||
      (isRecord(value.limits) &&
        Object.values(value.limits).every((limit) =>
          typeof limit === "string" ||
          typeof limit === "number" ||
          typeof limit === "boolean",
        )))
  );
};

const isRuntimeMcpServerManifest = (value: unknown): value is RuntimeMcpServerManifest =>
  isRecord(value) &&
  typeof value.name === "string" &&
  typeof value.command === "string" &&
  (value.args === undefined ||
    (Array.isArray(value.args) && value.args.every((arg) => typeof arg === "string"))) &&
  (value.envKeys === undefined ||
    (Array.isArray(value.envKeys) && value.envKeys.every((key) => typeof key === "string")));

const isStringArrayRecord = (value: unknown): value is Record<string, string[]> =>
  isRecord(value) &&
  Object.values(value).every(
    (members) => Array.isArray(members) && members.every((member) => typeof member === "string"),
  );

const isRuntimeMcpManifest = (value: unknown): value is RuntimeMcpManifest => {
  if (!isRecord(value) || !Array.isArray(value.servers)) return false;
  const catalog = value.catalog;
  return (
    (value.profileName === undefined || typeof value.profileName === "string") &&
    (value.serverGroups === undefined ||
      (Array.isArray(value.serverGroups) &&
        value.serverGroups.every((group) => typeof group === "string"))) &&
    value.servers.every(isRuntimeMcpServerManifest) &&
    (catalog === undefined ||
      (isRecord(catalog) &&
        (catalog.defaultServerGroups === undefined ||
          (Array.isArray(catalog.defaultServerGroups) &&
            catalog.defaultServerGroups.every((group) => typeof group === "string"))) &&
        (catalog.groups === undefined || isStringArrayRecord(catalog.groups)) &&
        (catalog.servers === undefined ||
          (Array.isArray(catalog.servers) &&
            catalog.servers.every((server) => typeof server === "string")))))
  );
};

const isRuntimeOrchestrationLaneManifest = (
  value: unknown,
): value is RuntimeOrchestrationLaneManifest =>
  isRecord(value) &&
  (value.capacity === undefined ||
    (typeof value.capacity === "number" &&
      Number.isInteger(value.capacity) &&
      value.capacity >= 0));

const isRuntimeOrchestrationRoleManifest = (
  value: unknown,
): value is RuntimeOrchestrationRoleManifest =>
  isRecord(value) &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  (value.description === undefined || typeof value.description === "string") &&
  (value.lane === undefined || ORCHESTRATION_LANES.has(value.lane as RuntimeOrchestrationLaneName)) &&
  (value.model === undefined || typeof value.model === "string") &&
  (value.maxTurns === undefined ||
    (typeof value.maxTurns === "number" && Number.isInteger(value.maxTurns) && value.maxTurns > 0)) &&
  (value.context === undefined || CONTEXT_MODES.has(value.context as RuntimeOrchestrationContextMode)) &&
  (value.toolScope === undefined ||
    (Array.isArray(value.toolScope) && value.toolScope.every((item) => typeof item === "string"))) &&
  (value.skillScope === undefined ||
    (Array.isArray(value.skillScope) && value.skillScope.every((item) => typeof item === "string"))) &&
  (value.mcpServers === undefined ||
    (Array.isArray(value.mcpServers) && value.mcpServers.every((item) => typeof item === "string"))) &&
  (value.permissionLabels === undefined ||
    (Array.isArray(value.permissionLabels) &&
      value.permissionLabels.every((item) => typeof item === "string")));

const isRuntimeOrchestrationHandoffManifest = (
  value: unknown,
): value is RuntimeOrchestrationHandoffManifest =>
  isRecord(value) &&
  typeof value.from === "string" &&
  value.from.length > 0 &&
  typeof value.to === "string" &&
  value.to.length > 0 &&
  (value.mode === undefined || HANDOFF_MODES.has(value.mode as RuntimeOrchestrationHandoffMode)) &&
  (value.inputFilter === undefined || typeof value.inputFilter === "string") &&
  (value.approvalRequired === undefined || typeof value.approvalRequired === "boolean") &&
  (value.conditions === undefined ||
    (Array.isArray(value.conditions) && value.conditions.every((item) => typeof item === "string")));

const isRuntimeOrchestrationManifest = (
  value: unknown,
): value is RuntimeOrchestrationManifest => {
  if (!isRecord(value)) return false;
  const lanes = value.lanes;
  return (
    (value.profileName === undefined || typeof value.profileName === "string") &&
    (value.handoffMode === undefined ||
      HANDOFF_MODES.has(value.handoffMode as RuntimeOrchestrationHandoffMode)) &&
    (value.defaultRole === undefined || typeof value.defaultRole === "string") &&
    (lanes === undefined ||
      (isRecord(lanes) &&
        Object.entries(lanes).every(
          ([lane, record]) =>
            ORCHESTRATION_LANES.has(lane as RuntimeOrchestrationLaneName) &&
            isRuntimeOrchestrationLaneManifest(record),
        ))) &&
    (value.roles === undefined ||
      (Array.isArray(value.roles) && value.roles.every(isRuntimeOrchestrationRoleManifest))) &&
    (value.handoffs === undefined ||
      (Array.isArray(value.handoffs) &&
        value.handoffs.every(isRuntimeOrchestrationHandoffManifest)))
  );
};

export function isRuntimeManifest(value: unknown): value is RuntimeManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.runtime !== "kirakira-agent" ||
    !isRecord(value.contract) ||
    value.contract.protocol !== "runtime-v1" ||
    value.contract.eventSchemaVersion !== 1 ||
    !isRecord(value.endpoints) ||
    !isRecord(value.capabilities) ||
    !isRecord(value.security)
  ) {
    return false;
  }
  const endpoint = value.endpoints.browserGateway;
  const capabilities = value.capabilities;
  const capabilityEntries = Object.entries(capabilities);
  const expectedIds = Object.keys(DEFAULT_CAPABILITIES);
  return (
    (value.endpoints.socketPath === undefined ||
      typeof value.endpoints.socketPath === "string") &&
    (endpoint === undefined ||
      (isRecord(endpoint) &&
        isEndpointParts(endpoint.endpoint) &&
        typeof endpoint.tokenRequired === "boolean")) &&
    capabilityEntries.length === expectedIds.length &&
    expectedIds.every((id) =>
      isRuntimeCapabilityRecord(capabilities[id], id),
    ) &&
    (value.mcp === undefined || isRuntimeMcpManifest(value.mcp)) &&
    (value.orchestration === undefined || isRuntimeOrchestrationManifest(value.orchestration)) &&
    value.security.loopbackRecommended === true &&
    value.security.secretsRedacted === true &&
    value.security.explicitToolConsentRequired === true
  );
}

export function isRuntimeBrowserGatewayHealth(
  value: unknown,
): value is RuntimeBrowserGatewayHealth {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.ok === true &&
    value.transport === "browser-gateway" &&
    isEndpointParts(value.endpoint) &&
    typeof value.tokenRequired === "boolean" &&
    isRuntimeManifest(value.manifest)
  );
}

export function isRuntimeDaemonHealth(value: unknown): value is RuntimeDaemonHealth {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.ok !== "boolean" ||
    typeof value.gateway !== "boolean" ||
    typeof value.kernel !== "boolean" ||
    typeof value.socket !== "boolean" ||
    typeof value.browserGateway !== "boolean" ||
    !isRecord(value.services) ||
    !isRecord(value.details)
  ) {
    return false;
  }
  const details = value.details;
  const detailsGateway = details.browserGateway;
  return (
    isRuntimeServiceHealth(value.services.gateway) &&
    isRuntimeServiceHealth(value.services.kernel) &&
    isRuntimeSocketHealth(value.services.socket) &&
    isRuntimeBrowserGatewayServiceHealth(value.services.browserGateway) &&
    (details.socketPath === undefined || typeof details.socketPath === "string") &&
    (detailsGateway === undefined ||
      (isRecord(detailsGateway) &&
        isEndpointParts(detailsGateway.endpoint) &&
        typeof detailsGateway.tokenRequired === "boolean")) &&
    isRuntimeManifest(details.manifest)
  );
}

export function sanitizeRuntimeDaemonHealth(health: RuntimeDaemonHealth): RuntimeDaemonHealth {
  if (!isRuntimeDaemonHealth(health)) {
    throw new Error("Runtime daemon health response is invalid");
  }
  return {
    schemaVersion: 1,
    ok: health.ok,
    gateway: health.gateway,
    kernel: health.kernel,
    socket: health.socket,
    browserGateway: health.browserGateway,
    services: {
      gateway: sanitizeServiceHealth(health.services.gateway),
      kernel: sanitizeServiceHealth(health.services.kernel),
      socket: sanitizeSocketHealth(health.services.socket),
      browserGateway: sanitizeBrowserGatewayServiceHealth(health.services.browserGateway),
    },
    details: {
      ...(health.details.socketPath !== undefined
        ? { socketPath: health.details.socketPath }
        : {}),
      ...(health.details.browserGateway !== undefined
        ? {
            browserGateway: {
              endpoint: sanitizeEndpointParts(health.details.browserGateway.endpoint),
              tokenRequired: health.details.browserGateway.tokenRequired,
            },
          }
        : {}),
      manifest: sanitizeRuntimeManifest(health.details.manifest),
    },
  };
}
