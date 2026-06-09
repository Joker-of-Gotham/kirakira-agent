export const runtimeScriptRegistry = {
  profile: {
    scriptName: "runtime-profile.mjs",
    description: "Render resolved Kirakira runtime profiles for local, Docker, web, and desktop callers.",
  },
  doctor: {
    scriptName: "runtime-doctor.mjs",
    description: "Validate runtime profile readiness and startup dependencies.",
  },
} as const;

export type RuntimeScriptId = keyof typeof runtimeScriptRegistry;

export interface RuntimeScriptDefinition {
  scriptName: string;
  description: string;
}

export function getRuntimeScriptDefinition(scriptId: RuntimeScriptId): RuntimeScriptDefinition {
  return runtimeScriptRegistry[scriptId];
}
