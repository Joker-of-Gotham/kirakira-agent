import type { RuntimeEndpointParts } from "./endpoint.js";

export type RuntimeHealthState = "healthy" | "unavailable" | "disabled";

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
  };
}

export interface RuntimeBrowserGatewayHealth {
  schemaVersion: 1;
  ok: boolean;
  transport: "browser-gateway";
  endpoint: RuntimeEndpointParts;
  tokenRequired: boolean;
}

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
}): RuntimeBrowserGatewayHealth {
  return {
    schemaVersion: 1,
    ok: true,
    transport: "browser-gateway",
    endpoint: input.endpoint,
    tokenRequired: input.tokenRequired,
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

export function isRuntimeBrowserGatewayHealth(
  value: unknown,
): value is RuntimeBrowserGatewayHealth {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.ok === true &&
    value.transport === "browser-gateway" &&
    isEndpointParts(value.endpoint) &&
    typeof value.tokenRequired === "boolean"
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
        typeof detailsGateway.tokenRequired === "boolean"))
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
    },
  };
}
