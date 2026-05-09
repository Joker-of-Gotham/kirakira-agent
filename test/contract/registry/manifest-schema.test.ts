import { describe, expect, it } from "vitest";
import { packageMetaSchema, resolvedSourceSchema, publishRequestSchema } from "../../../packages/core/src/schemas/registry.js";

describe("registry manifest schema backward compatibility", () => {
  it("validates a minimal PackageMeta", () => {
    const meta = {
      kind: "skill",
      name: "test-skill",
      version: "1.0.0",
      publisher: "org",
      publishedAt: "2025-01-01T00:00:00Z",
      digest: "sha256:abc123def456",
      trustLevel: "user-approved",
    };
    const result = packageMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  it("validates a full PackageMeta with all optional fields", () => {
    const meta = {
      kind: "mcp",
      name: "test-mcp",
      version: "2.0.0",
      description: "A test MCP server",
      publisher: "org",
      publishedAt: "2025-06-01T00:00:00Z",
      digest: "sha256:fedcba987654",
      signature: "base64sig==",
      trustLevel: "internal-signed",
      provenance: {
        buildType: "ci",
        builder: "github-actions",
        sourceRepo: "https://github.com/org/repo",
        sourceCommit: "abc123",
        buildTimestamp: "2025-06-01T00:00:00Z",
      },
      tags: ["stable", "production"],
      dependencies: { "@kirakira/core": "^0.1.0" },
      deprecated: false,
      yanked: false,
    };
    const result = packageMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  it("rejects invalid kind", () => {
    const meta = {
      kind: "invalid",
      name: "x",
      version: "1.0.0",
      publisher: "o",
      publishedAt: "2025-01-01T00:00:00Z",
      digest: "sha256:abc",
      trustLevel: "untrusted",
    };
    const result = packageMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  it("rejects missing digest prefix", () => {
    const meta = {
      kind: "skill",
      name: "x",
      version: "1.0.0",
      publisher: "o",
      publishedAt: "2025-01-01T00:00:00Z",
      digest: "md5:abc",
      trustLevel: "untrusted",
    };
    const result = packageMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  it("validates ResolvedSource", () => {
    const source = { type: "registry", uri: "my-skill" };
    expect(resolvedSourceSchema.safeParse(source).success).toBe(true);

    const withRef = { type: "github", uri: "org/repo", ref: "main" };
    expect(resolvedSourceSchema.safeParse(withRef).success).toBe(true);
  });

  it("validates PublishRequest", () => {
    const req = {
      kind: "skill",
      name: "test",
      version: "1.0.0",
      digest: "sha256:abc123",
    };
    expect(publishRequestSchema.safeParse(req).success).toBe(true);
  });
});
