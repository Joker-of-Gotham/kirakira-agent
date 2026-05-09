import { describe, expect, it } from "vitest";

import type { ArtifactMeta } from "@kirakira/memory-core";

/**
 * Blob paths for regulated (WORM) artifacts must live under a dedicated prefix
 * so object-lock policies can target them independently of mutable assets.
 */
export function wormAwareArtifactKey(tenantId: string, artifactId: string, worm: boolean): string {
  const segment = worm ? "worm" : "artifacts";
  return `tenants/${tenantId}/${segment}/${artifactId}`;
}

describe("WORM path builder", () => {
  it("routes regulated artifacts under the worm segment", () => {
    const tenantId = "acme";
    const artifactId = "550e8400-e29b-41d4-a716-446655440000";
    expect(wormAwareArtifactKey(tenantId, artifactId, true)).toBe(`tenants/${tenantId}/worm/${artifactId}`);
    expect(wormAwareArtifactKey(tenantId, artifactId, false)).toBe(`tenants/${tenantId}/artifacts/${artifactId}`);
  });

  it("keeps ArtifactMeta.worm aligned with storage policy flags", () => {
    const meta: ArtifactMeta = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      tenantId: "acme",
      uri: "s3://bucket/tenants/acme/worm/550e8400-e29b-41d4-a716-446655440000.bin",
      sha256: "deadbeef",
      mediaType: "application/octet-stream",
      bytes: 1024,
      worm: true,
      metadata: {},
      createdAt: "2026-05-06T12:00:00.000Z",
    };

    expect(meta.worm).toBe(true);
    expect(meta.uri).toContain("/worm/");
  });
});
