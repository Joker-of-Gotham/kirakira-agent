const ENV_PATTERN = /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g;

/**
 * Expand `${VAR}` and `${VAR:-default}` patterns in a string.
 * Mirrors the V3 Python `_env_expand_str` from `config.py`.
 */
export function envExpandStr(value: string): string {
  return value.replace(ENV_PATTERN, (_match, varName: string, fallback?: string) => {
    const envVal = process.env[varName];
    if (envVal !== undefined && envVal !== "") {
      return envVal;
    }
    return fallback ?? "";
  });
}

export function envExpand(obj: unknown): unknown {
  if (typeof obj === "string") {
    return envExpandStr(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(envExpand);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = envExpand(value);
    }
    return result;
  }
  return obj;
}
