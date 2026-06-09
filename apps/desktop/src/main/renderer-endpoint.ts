import {
  isLoopbackRuntimeHost,
  parseHttpRuntimeEndpoint,
  type RuntimeEndpointParts,
} from "@kirakira/runtime-contracts";
import { normalize } from "node:path";
import { fileURLToPath } from "node:url";

export interface DesktopRendererEndpointEnv {
  readonly [key: string]: string | undefined;
  KIRAKIRA_DESKTOP_RENDERER_URL?: string;
  KIRAKIRA_DESKTOP_DEV_URL?: string;
}

export interface DesktopRuntimeSenderTrustOptions {
  packagedRendererUrl?: string | null;
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

function normalizedFileUrlPath(value: string): string | null {
  try {
    const path = normalize(fileURLToPath(value));
    return process.platform === "win32" ? path.toLowerCase() : path;
  } catch {
    return null;
  }
}

function isTrustedPackagedRendererUrl(
  frameUrl: string,
  packagedRendererUrl: string | null | undefined,
): boolean {
  if (!packagedRendererUrl) return false;
  const framePath = normalizedFileUrlPath(frameUrl);
  const trustedPath = normalizedFileUrlPath(packagedRendererUrl);
  return Boolean(framePath && trustedPath && framePath === trustedPath);
}

export function isTrustedDesktopRuntimeSenderUrl(
  frameUrl: string | undefined,
  env: DesktopRendererEndpointEnv = process.env,
  options: DesktopRuntimeSenderTrustOptions = {},
): boolean {
  if (!frameUrl) return false;
  try {
    const parsed = new URL(frameUrl);
    if (parsed.protocol === "file:") {
      return isTrustedPackagedRendererUrl(frameUrl, options.packagedRendererUrl);
    }
    return trustedDesktopRendererOrigins(env).has(parsed.origin);
  } catch {
    return false;
  }
}
