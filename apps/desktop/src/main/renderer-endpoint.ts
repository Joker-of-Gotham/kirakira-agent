import {
  isLoopbackRuntimeHost,
  parseHttpRuntimeEndpoint,
  type RuntimeEndpointParts,
} from "@kirakira/runtime-contracts";

export interface DesktopRendererEndpointEnv {
  readonly [key: string]: string | undefined;
  KIRAKIRA_DESKTOP_RENDERER_URL?: string;
  KIRAKIRA_DESKTOP_DEV_URL?: string;
}

const configuredRendererUrl = (env: DesktopRendererEndpointEnv): string | undefined =>
  env.KIRAKIRA_DESKTOP_RENDERER_URL?.trim() ||
  env.KIRAKIRA_DESKTOP_DEV_URL?.trim() ||
  undefined;

export function resolveDesktopRendererEndpoint(
  env: DesktopRendererEndpointEnv = process.env,
): RuntimeEndpointParts | null {
  const value = configuredRendererUrl(env);
  if (!value) return null;
  try {
    const endpoint = parseHttpRuntimeEndpoint(value);
    if (endpoint.protocol !== "http") return null;
    if (!isLoopbackRuntimeHost(endpoint.host)) return null;
    return endpoint;
  } catch {
    return null;
  }
}

export function desktopRendererUrl(env: DesktopRendererEndpointEnv = process.env): string | null {
  return resolveDesktopRendererEndpoint(env)?.url ?? null;
}

export function trustedDesktopRendererOrigins(
  env: DesktopRendererEndpointEnv = process.env,
): Set<string> {
  const endpoint = resolveDesktopRendererEndpoint(env);
  return endpoint ? new Set([endpoint.origin]) : new Set<string>();
}

export function isTrustedDesktopRuntimeSenderUrl(
  frameUrl: string | undefined,
  env: DesktopRendererEndpointEnv = process.env,
): boolean {
  if (!frameUrl) return false;
  try {
    const parsed = new URL(frameUrl);
    if (parsed.protocol === "file:") return true;
    return trustedDesktopRendererOrigins(env).has(parsed.origin);
  } catch {
    return false;
  }
}
