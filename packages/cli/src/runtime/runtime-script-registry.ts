export type RuntimeScriptArgDescriptor =
  | {
      kind: "positional";
      option: string;
      defaultValue?: string;
      omitEmpty?: boolean;
    }
  | {
      kind: "flag";
      option: string;
      flag: string;
    }
  | {
      kind: "option";
      option: string;
      flag: string;
      defaultValue?: string;
      omitEmpty?: boolean;
    };

export interface RuntimeScriptDefinition {
  scriptName: string;
  description: string;
  args: readonly RuntimeScriptArgDescriptor[];
}

export interface RuntimeProfileScriptOptions {
  action?: string;
  profile?: string;
}

export interface RuntimeReadyScriptOptions {
  profile?: string;
  json?: boolean;
  noProbe?: boolean;
  planOnly?: boolean;
}

export interface RuntimeDoctorScriptOptions {
  profile?: string;
  json?: boolean;
  noProbe?: boolean;
  planOnly?: boolean;
  timeoutMs?: number;
}

export const runtimeScriptRegistry = {
  profile: {
    scriptName: "runtime-profile.mjs",
    description: "Render resolved Kirakira runtime profiles for local, Docker, web, and desktop callers.",
    args: [
      { kind: "positional", option: "action", defaultValue: "show" },
      { kind: "positional", option: "profile", omitEmpty: true },
    ],
  },
  ready: {
    scriptName: "runtime-ready.mjs",
    description: "Render profile-owned readiness, MCP, and startup plans without live probes.",
    args: [
      { kind: "positional", option: "profile", omitEmpty: true },
      { kind: "flag", option: "json", flag: "--json" },
      { kind: "flag", option: "noProbe", flag: "--no-probe" },
      { kind: "flag", option: "planOnly", flag: "--plan-only" },
    ],
  },
  doctor: {
    scriptName: "runtime-doctor.mjs",
    description: "Validate runtime profile readiness and startup dependencies.",
    args: [
      { kind: "positional", option: "profile", omitEmpty: true },
      { kind: "flag", option: "json", flag: "--json" },
      { kind: "flag", option: "noProbe", flag: "--no-probe" },
      { kind: "flag", option: "planOnly", flag: "--plan-only" },
      { kind: "option", option: "timeoutMs", flag: "--timeout-ms" },
    ],
  },
} as const satisfies Record<string, RuntimeScriptDefinition>;

export type RuntimeScriptId = keyof typeof runtimeScriptRegistry;

export interface RuntimeScriptOptionsById {
  profile: RuntimeProfileScriptOptions;
  ready: RuntimeReadyScriptOptions;
  doctor: RuntimeDoctorScriptOptions;
}

export function getRuntimeScriptDefinition(scriptId: RuntimeScriptId): RuntimeScriptDefinition {
  return runtimeScriptRegistry[scriptId];
}

function optionValue(options: object | undefined, option: string): unknown {
  return (options as Record<string, unknown> | undefined)?.[option];
}

function hasSerializableValue(
  value: unknown,
  descriptor: { omitEmpty?: boolean },
): value is string | number | boolean {
  if (value === undefined || value === null || value === false) return false;
  if (descriptor.omitEmpty === true && value === "") return false;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function serializeRuntimeScriptArgs<TScriptId extends RuntimeScriptId>(
  scriptId: TScriptId,
  options: RuntimeScriptOptionsById[TScriptId] = {} as RuntimeScriptOptionsById[TScriptId],
): string[] {
  const definition = getRuntimeScriptDefinition(scriptId);
  const args: string[] = [];
  for (const descriptor of definition.args) {
    if (descriptor.kind === "flag") {
      const configuredValue = optionValue(options, descriptor.option);
      if (configuredValue === true) args.push(descriptor.flag);
      continue;
    }
    const configuredValue = optionValue(options, descriptor.option) ?? descriptor.defaultValue;
    if (!hasSerializableValue(configuredValue, descriptor)) continue;
    if (descriptor.kind === "option") args.push(descriptor.flag);
    args.push(String(configuredValue));
  }
  return args;
}
