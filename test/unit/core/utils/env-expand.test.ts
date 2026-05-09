import { afterEach, describe, expect, it } from "vitest";
import { envExpand, envExpandStr } from "@kirakira/core";

describe("envExpandStr", () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of Object.keys(prev)) {
      const v = prev[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function stash(key: string): void {
    if (!(key in prev)) prev[key] = process.env[key];
  }

  it("expands ${VAR}", () => {
    stash("KIRAKIRA_VITEST_A");
    process.env.KIRAKIRA_VITEST_A = "foo";
    expect(envExpandStr("x${KIRAKIRA_VITEST_A}y")).toBe("xfooy");
  });

  it("uses ${VAR:-default} when unset", () => {
    stash("KIRAKIRA_VITEST_MISSING");
    delete process.env.KIRAKIRA_VITEST_MISSING;
    expect(envExpandStr("${KIRAKIRA_VITEST_MISSING:-D}")).toBe("D");
  });

  it("ignores default when VAR is set non-empty", () => {
    stash("KIRAKIRA_VITEST_B");
    process.env.KIRAKIRA_VITEST_B = "V";
    expect(envExpandStr("${KIRAKIRA_VITEST_B:-D}")).toBe("V");
  });

  it("nested expansion via envExpand object", () => {
    stash("KIRAKIRA_OUTER");
    process.env.KIRAKIRA_OUTER = "OUT";
    const expanded = envExpand({
      a: "${KIRAKIRA_OUTER}",
      b: ["${KIRAKIRA_OUTER}"],
    }) as { a: string; b: string[] };
    expect(expanded.a).toBe("OUT");
    expect(expanded.b[0]).toBe("OUT");
  });
});
