import type { RuntimeEndpointParts } from "./endpoint.js";
import type { RunEventKind } from "./events.js";
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
    summary: "Attach durable memory recall and retain planes through injected runtime services.",
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

export function runtimeManifest(input: {
  socketPath?: string;
  browserGateway?: {
    endpoint: RuntimeEndpointParts;
    tokenRequired: boolean;
  };
  capabilities?: RuntimeCapabilityOverrides;
  mcp?: RuntimeMcpManifest;
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
      ? { eventKinds: capability.eventKinds.filter((kind) => typeof kind === "string") }
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
        value.eventKinds.every((kind) => typeof kind === "string"))) &&
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
