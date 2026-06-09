import type {
  RuntimeManifest,
} from "@kirakira/runtime-contracts";
import type { RuntimeTransportStatus } from "./transport.js";

export function runtimeTransportManifest(
  status: RuntimeTransportStatus | undefined,
): RuntimeManifest | undefined {
  const health = status?.health;
  if (!health) return undefined;
  if ("manifest" in health) return health.manifest;
  return health.details.manifest;
}

export function runtimeTransportSupportsArtifactContent(
  status: RuntimeTransportStatus | undefined,
): boolean {
  const manifest = runtimeTransportManifest(status);
  if (!manifest) return status?.mode === "mock";
  const capability = manifest.capabilities.artifacts;
  return (
    capability.state === "enabled" &&
    capability.clientMessageTypes?.includes("get_artifact") === true
  );
}
