import { describe, expect, it } from "vitest";
import { isShellAllowed } from "../../../../packages/cli/src/approval/policy-matcher.js";

describe("policy-matcher shell globs", () => {
  /** Implementation maps `*` → `.*` in a single segment; use `git *`-style patterns for CLI commands. */
  const allowlist = ["git *", "pytest *"];
  const denylist = ["rm *", "sudo *"];

  it("deny wins over allow", () => {
    const r = isShellAllowed("rm -rf /", allowlist, denylist);
    expect(r.allowed).toBe(false);
    expect(r.denyHit).toBe(true);
  });

  it("allowlist permits git and pytest patterns", () => {
    expect(isShellAllowed("git status", allowlist, denylist).allowed).toBe(true);
    expect(isShellAllowed("pytest -q", allowlist, denylist).allowed).toBe(true);
  });

  it("blocks sudo", () => {
    expect(isShellAllowed("sudo reboot", allowlist, denylist).allowed).toBe(false);
  });

  it("empty allowlist permits unless denied", () => {
    expect(isShellAllowed("anything", undefined, undefined).allowed).toBe(true);
  });
});
