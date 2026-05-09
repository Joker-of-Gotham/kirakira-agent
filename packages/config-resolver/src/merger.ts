/**
 * Deep merge engine for agent.toml layers.
 *
 * Rules:
 *  - Later layers override earlier layers at the leaf level
 *  - Arrays use REPLACE strategy (not append)
 *  - Explicit null clears a key set by a parent layer
 *  - undefined / missing keys are skipped (no effect)
 */

type Obj = Record<string, unknown>;

function isPlainObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge<T extends Obj>(base: T, ...layers: Array<Partial<T>>): T {
  let result: Obj = structuredClone(base) as Obj;

  for (const layer of layers) {
    result = mergeTwo(result, layer as Obj);
  }

  return result as T;
}

function mergeTwo(base: Obj, overlay: Obj): Obj {
  const result: Obj = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;

    if (value === null) {
      delete result[key];
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = [...value];
      continue;
    }

    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeTwo(result[key] as Obj, value);
      continue;
    }

    result[key] = structuredClone(value);
  }

  return result;
}
