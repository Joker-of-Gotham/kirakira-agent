import { describe, expect, it } from "vitest";

import { buildPresentationRenderEvidence } from "../../../packages/frontend-app/src/presentation-render-evidence.js";

describe("presentation render evidence", () => {
  it("renders web and desktop surfaces without touching runtime transport", () => {
    const report = buildPresentationRenderEvidence({
      profile: "workbench-host",
      generatedAt: "2026-06-10T00:00:00.000Z",
      command: "test",
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      gate: "presentation-render-evidence",
      profile: "workbench-host",
      status: "passed",
      generatedAt: "2026-06-10T00:00:00.000Z",
      summary: {
        failed: 0,
        total: 8,
      },
    });
    expect(report.surfaces.map((surface) => surface.surface)).toEqual(["web", "desktop"]);
    expect(report.surfaces.map((surface) => surface.transportMode)).toEqual([
      "browser-gateway",
      "desktop-ipc",
    ]);
    for (const surface of report.surfaces) {
      expect(surface.html.bytes).toBeGreaterThan(1000);
      expect(surface.html.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(surface.selectors.every((marker) => marker.status === "pass")).toBe(true);
      expect(surface.textMarkers.every((marker) => marker.status === "pass")).toBe(true);
      expect(surface.selectors).toContainEqual(
        expect.objectContaining({
          id: "command-layer",
          value: 'aria-label="Open command palette"',
          status: "pass",
        }),
      );
      expect(Object.values(surface.transportCalls)).toEqual(
        expect.arrayContaining([0]),
      );
      expect(Object.values(surface.transportCalls).reduce((total, count) => total + count, 0)).toBe(0);
      expect(surface.failures).toEqual([]);
    }
    expect(JSON.stringify(report)).not.toContain("<main");
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("keeps surface identity and environment labels distinct", () => {
    const report = buildPresentationRenderEvidence({
      profile: "workbench-host",
      generatedAt: "2026-06-10T00:00:00.000Z",
    });

    const web = report.surfaces.find((surface) => surface.surface === "web");
    const desktop = report.surfaces.find((surface) => surface.surface === "desktop");

    expect(web?.environmentLabel).toBe("Browser gateway");
    expect(desktop?.environmentLabel).toBe("Desktop IPC");
    expect(web?.selectors).toContainEqual(
      expect.objectContaining({
        id: "surface-identity",
        value: 'data-kk-presentation-surface="web"',
        status: "pass",
      }),
    );
    expect(desktop?.selectors).toContainEqual(
      expect.objectContaining({
        id: "surface-identity",
        value: 'data-kk-presentation-surface="desktop"',
        status: "pass",
      }),
    );
  });
});
