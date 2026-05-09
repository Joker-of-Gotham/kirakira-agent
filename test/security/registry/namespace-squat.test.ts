import { describe, expect, it } from "vitest";
import { resolveSource } from "../../../packages/registry-client/src/resolver.js";

describe("security: namespace squatting prevention", () => {
  it("preserves exact package names", () => {
    const s = resolveSource("registry://org/legit-package@1.0.0");
    expect(s.uri).toBe("org/legit-package");
    expect(s.type).toBe("registry");
  });

  it("does not confuse similar names", () => {
    const legit = resolveSource("registry://org/tool@1.0.0");
    const squat = resolveSource("registry://0rg/tool@1.0.0");
    expect(legit.uri).not.toBe(squat.uri);
  });

  it("classifies path traversal attempts as registry type", () => {
    const s = resolveSource("registry://../../etc/passwd");
    expect(s.type).toBe("registry");
    expect(s.uri).toContain("..");
  });

  it("treats different source types as distinct", () => {
    const reg = resolveSource("registry://tool@1.0");
    const npm = resolveSource("npm:tool@1.0");
    expect(reg.type).toBe("registry");
    expect(npm.type).toBe("npm");
  });

  it("strips whitespace from specifiers", () => {
    const s = resolveSource("  registry://tool@1.0.0  ");
    expect(s.uri).toBe("tool");
    expect(s.ref).toBe("1.0.0");
  });
});
