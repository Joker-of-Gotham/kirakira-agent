import { describe, expect, it } from "vitest";
import {
  packageMetaSchema,
  isReservedNamespace,
  assertPackageInstallable,
} from "@kirakira/core";

describe("packageMetaSchema", () => {
  it("accepts a full package with state and preserves all fields", () => {
    const raw = {
      kind: "skill",
      name: "@kirakira/test-skill",
      version: "1.0.0",
      publisher: "test-user",
      publishedAt: "2025-01-01T00:00:00Z",
      digest: "sha256:abcd1234",
      trustLevel: "user-approved",
      state: "active",
    };
    const r = packageMetaSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.kind).toBe("skill");
      expect(r.data.name).toBe("@kirakira/test-skill");
      expect(r.data.version).toBe("1.0.0");
      expect(r.data.state).toBe("active");
      expect(r.data.digest).toBe("sha256:abcd1234");
    }
  });

  it("accepts quarantined state with reason and preserves reason", () => {
    const raw = {
      kind: "mcp",
      name: "suspicious-tool",
      version: "0.1.0",
      publisher: "unknown",
      publishedAt: "2025-06-01T00:00:00Z",
      digest: "sha256:0000abcd",
      trustLevel: "untrusted",
      state: "quarantined",
      quarantinedReason: "Suspicious network behavior detected",
    };
    const r = packageMetaSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.state).toBe("quarantined");
      expect(r.data.quarantinedReason).toBe("Suspicious network behavior detected");
    }
  });

  it("rejects invalid state enum", () => {
    const raw = {
      kind: "skill",
      name: "x",
      version: "1.0.0",
      publisher: "p",
      publishedAt: "2025-01-01",
      digest: "sha256:abc",
      trustLevel: "untrusted",
      state: "deleted",
    };
    const r = packageMetaSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });
});

describe("isReservedNamespace", () => {
  it("detects @kirakira/ as reserved", () => {
    expect(isReservedNamespace("@kirakira/core")).toBe(true);
  });

  it("detects @kirakira-internal/ as reserved", () => {
    expect(isReservedNamespace("@kirakira-internal/secret")).toBe(true);
  });

  it("detects @system/ as reserved", () => {
    expect(isReservedNamespace("@system/config")).toBe(true);
  });

  it("detects @enterprise/ as reserved", () => {
    expect(isReservedNamespace("@enterprise/policy")).toBe(true);
  });

  it("allows normal packages", () => {
    expect(isReservedNamespace("my-skill")).toBe(false);
    expect(isReservedNamespace("@myorg/tool")).toBe(false);
  });

  it("case insensitive", () => {
    expect(isReservedNamespace("@Kirakira/Core")).toBe(true);
  });
});

describe("assertPackageInstallable", () => {
  it("allows active packages", () => {
    expect(() => assertPackageInstallable({ state: "active" })).not.toThrow();
  });

  it("allows packages without state field", () => {
    expect(() => assertPackageInstallable({})).not.toThrow();
  });

  it("blocks yanked packages", () => {
    expect(() =>
      assertPackageInstallable({ state: "yanked", yankedReason: "security vuln" }),
    ).toThrow(/yanked/i);
  });

  it("blocks yanked via legacy boolean", () => {
    expect(() => assertPackageInstallable({ yanked: true })).toThrow(/yanked/i);
  });

  it("blocks quarantined packages", () => {
    expect(() =>
      assertPackageInstallable({
        state: "quarantined",
        quarantinedReason: "suspicious behavior",
      }),
    ).toThrow(/quarantined/i);
  });

  it("blocks archived packages", () => {
    expect(() => assertPackageInstallable({ state: "archived" })).toThrow(
      /archived/i,
    );
  });
});
