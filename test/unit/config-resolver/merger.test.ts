import { describe, expect, it } from "vitest";
import { deepMerge } from "../../../packages/config-resolver/src/merger.js";

describe("deepMerge", () => {
  it("later layers override earlier layers", () => {
    const base = { a: 1, b: 2 };
    const result = deepMerge(base, { a: 10 });
    expect(result).toEqual({ a: 10, b: 2 });
  });

  it("deep-merges nested objects", () => {
    const base = { model: { default: "gpt-4o", fallback: "gpt-4o-mini" } };
    const overlay = { model: { default: "claude-sonnet" } };
    const result = deepMerge(base, overlay);
    expect(result.model).toEqual({ default: "claude-sonnet", fallback: "gpt-4o-mini" });
  });

  it("replaces arrays (not append)", () => {
    const base = { tags: ["a", "b"] };
    const overlay = { tags: ["c"] };
    const result = deepMerge(base, overlay);
    expect(result.tags).toEqual(["c"]);
  });

  it("explicit null clears a key", () => {
    const base = { model: { default: "gpt-4o", fallback: "backup" } } as any;
    const overlay = { model: { fallback: null } } as any;
    const result = deepMerge(base, overlay);
    expect(result.model.fallback).toBeUndefined();
    expect(result.model.default).toBe("gpt-4o");
  });

  it("undefined keys are skipped", () => {
    const base = { a: 1, b: 2 };
    const overlay = { a: undefined, b: 3 };
    const result = deepMerge(base, overlay as any);
    expect(result).toEqual({ a: 1, b: 3 });
  });

  it("merges multiple layers in order", () => {
    const base = { x: 1, y: 2, z: 3 };
    const result = deepMerge(base, { x: 10 }, { y: 20 }, { z: 30 });
    expect(result).toEqual({ x: 10, y: 20, z: 30 });
  });

  it("does not mutate the base object", () => {
    const base = { a: { b: 1 } };
    const copy = JSON.parse(JSON.stringify(base));
    deepMerge(base, { a: { b: 99 } });
    expect(base).toEqual(copy);
  });
});
