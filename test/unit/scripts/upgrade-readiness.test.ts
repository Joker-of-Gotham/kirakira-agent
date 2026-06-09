import { describe, expect, it } from "vitest";
import {
  buildUpgradeReadinessReport,
  normalizeUpgradeReadinessArgs,
  renderUpgradeReadinessReport,
} from "../../../scripts/upgrade-readiness.mjs";

describe("upgrade readiness gate", () => {
  it("parses profile and output arguments", () => {
    expect(
      normalizeUpgradeReadinessArgs([
        "--profile",
        "workbench-host",
        "--format",
        "json",
        "--fail-on-issues",
      ]),
    ).toMatchObject({
      profileName: "workbench-host",
      format: "json",
      failOnIssues: true,
    });
  });

  it("summarizes the four upgrade tracks from current repo evidence", () => {
    const report = buildUpgradeReadinessReport({ profileName: "workbench-host" });

    expect(report.profile).toBe("workbench-host");
    expect(report.tracks.map((track) => track.id)).toEqual([
      "eam-mechanism-parity",
      "web-electron-presentation",
      "harness-api-contracts",
      "docker-local-ecosystem",
    ]);
    expect(report.summary.fail).toBe(0);
    expect(report.summary.checks).toBeGreaterThan(12);
    expect(report.summary.openWork).toBe(1);
    expect(report.summary.advisoryWarnings).toBe(1);
    expect(report.advisoryWarnings).toContainEqual(
      expect.objectContaining({
        item: "File-level mechanism drift has behavior classifications",
        status: "warn",
      }),
    );
    expect(
      report.openWork.some((item) =>
        item.item.includes("File-level mechanism drift has behavior classifications"),
      ),
    ).toBe(false);
    expect(
      report.openWork.some((item) =>
        item.item.includes("live daemon source adapters"),
      ),
    ).toBe(true);
    expect(report.gates.memoryPersistence.profile).toBe("test-host");
    expect(report.tracks).toContainEqual(
      expect.objectContaining({
        id: "docker-local-ecosystem",
        checks: expect.arrayContaining([
          expect.objectContaining({
            label: "Memory retain/reflect unit contract is separate from live persistence",
            status: "pass",
          }),
          expect.objectContaining({
            label: "Memory-store checkpoint + retain/reflect live persistence gate",
            status: "pass",
          }),
        ]),
      }),
    );
    expect(
      report.openWork.some((item) =>
        item.item.includes("Memory-store checkpoint + retain/reflect live persistence gate"),
      ),
    ).toBe(false);
    expect(report.gates.memoryPersistence.evidence).toMatchObject({
      resultPath: "docs/upgrade/gates/memory-persistence-smoke.json",
      resultMatches: true,
    });
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("renders markdown and json reports", () => {
    const report = buildUpgradeReadinessReport({ profileName: "workbench-host" });
    const markdown = renderUpgradeReadinessReport(report, "markdown");
    const json = JSON.parse(renderUpgradeReadinessReport(report, "json"));

    expect(markdown).toContain("# Kirakira Upgrade Readiness");
    expect(markdown).toContain("## Advisory Warnings");
    expect(markdown).toContain("## Open Work");
    expect(markdown).toContain("EAM Mechanism Parity");
    expect(json.summary.status).toBe(report.summary.status);
    expect(json.openWork.length).toBe(report.openWork.length);
    expect(json.advisoryWarnings.length).toBe(report.advisoryWarnings.length);
  });
});
