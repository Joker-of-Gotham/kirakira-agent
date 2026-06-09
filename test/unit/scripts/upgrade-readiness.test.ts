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
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("renders markdown and json reports", () => {
    const report = buildUpgradeReadinessReport({ profileName: "workbench-host" });
    const markdown = renderUpgradeReadinessReport(report, "markdown");
    const json = JSON.parse(renderUpgradeReadinessReport(report, "json"));

    expect(markdown).toContain("# Kirakira Upgrade Readiness");
    expect(markdown).toContain("EAM Mechanism Parity");
    expect(json.summary.status).toBe(report.summary.status);
  });
});
