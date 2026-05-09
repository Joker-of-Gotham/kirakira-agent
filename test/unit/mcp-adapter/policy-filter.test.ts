import { describe, expect, it } from "vitest";
import {
  checkDomainPolicy,
  checkServerPolicy,
  isToolReadonly,
} from "../../../packages/mcp-adapter/src/policy-filter.js";

describe("checkDomainPolicy", () => {
  it("allows URLs when no policy", () => {
    const r = checkDomainPolicy("https://api.example.com/mcp", {});
    expect(r.allowed).toBe(true);
  });

  it("blocks denied domains", () => {
    const r = checkDomainPolicy("https://evil.example.com/mcp", {
      deniedDomains: ["evil.example.com"],
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("denied");
  });

  it("blocks domains not in allowed list", () => {
    const r = checkDomainPolicy("https://other.com/mcp", {
      allowedDomains: ["api.example.com"],
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("not in the allowed list");
  });

  it("supports wildcard domain patterns", () => {
    const r = checkDomainPolicy("https://api.internal.example.com/mcp", {
      allowedDomains: ["*.example.com"],
    });
    expect(r.allowed).toBe(true);
  });

  it("rejects invalid URLs", () => {
    const r = checkDomainPolicy("not-a-url", {});
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("Invalid URL");
  });
});

describe("checkServerPolicy", () => {
  it("allows servers when no policy", () => {
    const r = checkServerPolicy("my-server", {});
    expect(r.allowed).toBe(true);
  });

  it("blocks denied servers", () => {
    const r = checkServerPolicy("evil-server", {
      deniedServers: ["evil-server"],
    });
    expect(r.allowed).toBe(false);
  });

  it("blocks servers not in approved list", () => {
    const r = checkServerPolicy("unknown", {
      approvedServers: ["approved-server"],
    });
    expect(r.allowed).toBe(false);
  });

  it("allows approved servers", () => {
    const r = checkServerPolicy("my-server", {
      approvedServers: ["my-server", "other-server"],
    });
    expect(r.allowed).toBe(true);
  });
});

describe("isToolReadonly", () => {
  it("returns true for tools in readonly list", () => {
    expect(isToolReadonly("read_file", { readonlyTools: ["read_file", "search"] })).toBe(true);
  });

  it("returns false for tools not in readonly list", () => {
    expect(isToolReadonly("write_file", { readonlyTools: ["read_file"] })).toBe(false);
  });

  it("returns false when no readonly tools defined", () => {
    expect(isToolReadonly("anything", {})).toBe(false);
  });
});
