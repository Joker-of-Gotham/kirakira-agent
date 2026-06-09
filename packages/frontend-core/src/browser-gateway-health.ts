import {
  isRuntimeBrowserGatewayHealth,
  isRuntimeManifest,
  parseWebSocketRuntimeEndpoint,
  type RuntimeBrowserGatewayHealth,
  type RuntimeEndpointParts,
  type RuntimeManifest,
} from "@kirakira/runtime-contracts";

export interface BrowserGatewayHealthOptions {
  endpoint: string | RuntimeEndpointParts;
  fetcher?: typeof fetch;
}

const endpointParts = (endpoint: string | RuntimeEndpointParts): RuntimeEndpointParts => {
  if (typeof endpoint === "string") return parseWebSocketRuntimeEndpoint(endpoint);
  if (endpoint.protocol !== "ws" && endpoint.protocol !== "wss") {
    throw new Error(`Runtime gateway endpoint protocol is not allowed: ${endpoint.protocol}`);
  }
  return endpoint;
};

export function browserGatewayHealthUrl(endpoint: string | RuntimeEndpointParts): string {
  const parts = endpointParts(endpoint);
  const url = new URL(parts.url);
  url.protocol = parts.protocol === "wss" ? "https:" : "http:";
  url.pathname = "/healthz";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function browserGatewayManifestUrl(endpoint: string | RuntimeEndpointParts): string {
  const parts = endpointParts(endpoint);
  const url = new URL(parts.url);
  url.protocol = parts.protocol === "wss" ? "https:" : "http:";
  url.pathname = "/manifest";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function fetchBrowserGatewayHealth(
  options: BrowserGatewayHealthOptions,
): Promise<RuntimeBrowserGatewayHealth> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const response = await fetcher(browserGatewayHealthUrl(options.endpoint));
  if (!response.ok) {
    throw new Error(`Runtime gateway health check failed: ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!isRuntimeBrowserGatewayHealth(payload)) {
    throw new Error("Runtime gateway health response is invalid");
  }
  return payload;
}

export async function fetchBrowserGatewayManifest(
  options: BrowserGatewayHealthOptions,
): Promise<RuntimeManifest> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const response = await fetcher(browserGatewayManifestUrl(options.endpoint));
  if (!response.ok) {
    throw new Error(`Runtime gateway manifest request failed: ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!isRuntimeManifest(payload)) {
    throw new Error("Runtime gateway manifest response is invalid");
  }
  return payload;
}
