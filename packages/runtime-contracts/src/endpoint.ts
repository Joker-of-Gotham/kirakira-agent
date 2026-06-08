export type RuntimeHttpProtocol = "http" | "https";
export type RuntimeWebSocketProtocol = "ws" | "wss";
export type RuntimeEndpointProtocol = RuntimeHttpProtocol | RuntimeWebSocketProtocol;

export interface RuntimeEndpointParts {
  protocol: RuntimeEndpointProtocol;
  host: string;
  port: number;
  path: string;
  url: string;
  origin: string;
}

export interface RuntimeEndpointInput {
  protocol?: RuntimeEndpointProtocol;
  host?: string;
  port?: number | string;
  path?: string;
  url?: string;
}

export interface RuntimeEndpointDefault {
  protocol: RuntimeEndpointProtocol;
  host: string;
  port: number;
  path: string;
}

export const DEFAULT_WEB_ENDPOINT = {
  protocol: "http",
  host: "127.0.0.1",
  port: 5183,
  path: "/",
} as const satisfies RuntimeEndpointDefault;

export const DEFAULT_DESKTOP_RENDERER_ENDPOINT = {
  protocol: "http",
  host: "127.0.0.1",
  port: 5174,
  path: "/",
} as const satisfies RuntimeEndpointDefault;

export const DEFAULT_BROWSER_GATEWAY_ENDPOINT = {
  protocol: "ws",
  host: "127.0.0.1",
  port: 17373,
  path: "/runtime",
} as const satisfies RuntimeEndpointDefault;

const HTTP_PROTOCOLS = new Set<RuntimeEndpointProtocol>(["http", "https"]);
const WS_PROTOCOLS = new Set<RuntimeEndpointProtocol>(["ws", "wss"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const trimProtocol = (value: string): RuntimeEndpointProtocol | undefined => {
  const protocol = value.replace(/:$/u, "");
  return HTTP_PROTOCOLS.has(protocol as RuntimeEndpointProtocol) ||
    WS_PROTOCOLS.has(protocol as RuntimeEndpointProtocol)
    ? (protocol as RuntimeEndpointProtocol)
    : undefined;
};

export function normalizeRuntimePath(path: string | undefined, fallback = "/"): string {
  const value = path?.trim() || fallback;
  return value.startsWith("/") ? value : `/${value}`;
}

export function parseRuntimePort(value: number | string | undefined, fallback?: number): number {
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error("Runtime endpoint port is required");
  }
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Runtime endpoint port is invalid: ${value}`);
  }
  return port;
}

export function isLoopbackRuntimeHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  const unbracketed =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;
  return LOOPBACK_HOSTS.has(unbracketed);
}

export function runtimeOrigin(value: string): string {
  return new URL(value).origin;
}

export function parseRuntimeOriginList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(runtimeOrigin);
  return origins.length > 0 ? [...new Set(origins)] : undefined;
}

export function renderRuntimeEndpoint(input: RuntimeEndpointInput): RuntimeEndpointParts {
  if (input.url?.trim()) {
    return parseRuntimeEndpoint(input.url, {
      protocol: input.protocol,
      path: input.path,
    });
  }
  const protocol = input.protocol ?? "http";
  const host = input.host?.trim();
  if (!host) throw new Error("Runtime endpoint host is required");
  const port = parseRuntimePort(input.port);
  const path = normalizeRuntimePath(input.path, "/");
  const url = `${protocol}://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}${path}`;
  return parseRuntimeEndpoint(url);
}

export function parseRuntimeEndpoint(
  value: string,
  options: {
    protocol?: RuntimeEndpointProtocol;
    allowedProtocols?: RuntimeEndpointProtocol[];
    path?: string;
  } = {},
): RuntimeEndpointParts {
  const raw = value.trim();
  if (!raw) throw new Error("Runtime endpoint URL is required");
  const url = new URL(raw);
  const protocol = trimProtocol(url.protocol);
  if (!protocol) throw new Error(`Runtime endpoint protocol is unsupported: ${url.protocol}`);
  if (options.protocol && protocol !== options.protocol) {
    throw new Error(`Runtime endpoint protocol must be ${options.protocol}`);
  }
  if (options.allowedProtocols && !options.allowedProtocols.includes(protocol)) {
    throw new Error(`Runtime endpoint protocol is not allowed: ${protocol}`);
  }
  if (!url.hostname) throw new Error("Runtime endpoint host is required");
  const port = parseRuntimePort(url.port);
  const path = normalizeRuntimePath(options.path ?? url.pathname, "/");
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return {
    protocol,
    host: url.hostname,
    port,
    path,
    url: url.toString(),
    origin: url.origin,
  };
}

export function parseHttpRuntimeEndpoint(value: string): RuntimeEndpointParts {
  return parseRuntimeEndpoint(value, { allowedProtocols: ["http", "https"] });
}

export function parseWebSocketRuntimeEndpoint(value: string): RuntimeEndpointParts {
  return parseRuntimeEndpoint(value, { allowedProtocols: ["ws", "wss"] });
}

export function browserGatewayEndpointFromParts(
  input: Omit<RuntimeEndpointInput, "url" | "protocol"> & { url?: string },
): RuntimeEndpointParts {
  return renderRuntimeEndpoint({
    protocol: DEFAULT_BROWSER_GATEWAY_ENDPOINT.protocol,
    host: DEFAULT_BROWSER_GATEWAY_ENDPOINT.host,
    port: DEFAULT_BROWSER_GATEWAY_ENDPOINT.port,
    path: DEFAULT_BROWSER_GATEWAY_ENDPOINT.path,
    ...input,
    url: input.url,
  });
}
