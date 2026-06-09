import type {
  ResolvedConfig,
  ResolvedRuntimeProfileState,
} from "@kirakira/core";

export function activeRuntimeProfile(
  resolvedConfig: Pick<ResolvedConfig, "runtimeState"> | undefined,
  runtimeProfileName: string | undefined,
): ResolvedRuntimeProfileState | undefined {
  const runtimeState = resolvedConfig?.runtimeState;
  const profiles = runtimeState?.profiles ?? [];
  const profileName = runtimeProfileName ?? runtimeState?.default_profile;
  return profiles.find((profile) => profile.name === profileName) ?? profiles[0];
}
