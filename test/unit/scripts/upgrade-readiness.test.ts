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
    expect(report.summary.openWork).toBe(0);
    expect(report.summary.advisoryWarnings).toBe(0);
    expect(report.advisoryWarnings).toEqual([]);
    expect(report.openWork).toEqual([]);
    expect(
      report.openWork.some((item) =>
        item.item.includes("File-level mechanism drift has behavior classifications"),
      ),
    ).toBe(false);
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
          expect.objectContaining({
            label: "Profile-owned runtime integration gate aggregates child gates",
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
    expect(report.gates.deepResearchLiveAdapters).toMatchObject({
      status: "pass",
      gate: "deep-research:live-adapters",
      profile: "workbench-host",
      requiredSuites: ["file", "web", "mcp"],
      coveredSuites: ["file", "web", "mcp"],
      missingSuites: [],
      liveGate: {
        resultPath: "docs/upgrade/gates/deep-research-live-adapters.json",
        status: "passed",
        resultMatches: true,
      },
    });
    expect(report.gates.runtimeIntegration).toMatchObject({
      gate: "upgrade",
      gateSource: "runtime-profile.integrationGates",
      status: "passed",
      evidence: expect.objectContaining({
        childGatesPassed: true,
      }),
    });
    expect(report.gates.presentationProjection).toMatchObject({
      status: "pass",
      source: "runtime-profile-projection",
      failures: 0,
    });
    expect(report.gates.presentationRenderEvidence).toMatchObject({
      status: "pass",
      resultPath: "docs/upgrade/gates/presentation-render-evidence.json",
      profile: "workbench-host",
      resultStatus: "passed",
      resultMatches: true,
      transportCalls: 0,
      targetsPass: true,
      containsForbiddenPort: false,
    });
    expect(report.gates.presentationHydratedVisualQa).toMatchObject({
      status: "pass",
      resultPath: "docs/upgrade/gates/presentation-hydrated-visual-qa.json",
      profile: "workbench-host",
      resultStatus: "passed",
      resultMatches: true,
      surfaces: ["desktop", "web"],
      viewports: ["desktop", "mobile", "tablet"],
      views: ["agents", "research", "runs", "systems"],
      consoleErrors: 0,
      pageErrors: 0,
      overflowViolations: 0,
      containsForbiddenPort: false,
    });
    expect(report.gates.presentationProjection.targets).toEqual([
      expect.objectContaining({
        surface: "web",
        readinessName: "presentation:web",
        envName: "KIRAKIRA_WEB_URL",
        readinessTarget: "http://127.0.0.1:5183/",
        envTarget: "http://127.0.0.1:5183/",
        status: "pass",
      }),
      expect.objectContaining({
        surface: "desktop",
        readinessName: "presentation:desktop",
        envName: "KIRAKIRA_DESKTOP_RENDERER_URL",
        readinessTarget: "http://127.0.0.1:5174/",
        envTarget: "http://127.0.0.1:5174/",
        status: "pass",
      }),
    ]);
    expect(report.gates.harnessHardcoding).toMatchObject({
      status: "pass",
      forbiddenPort: 5173,
      totalMatches: 0,
    });
    expect(report.gates.harnessHardcoding.scopes).toEqual([
      expect.objectContaining({
        name: "runtime-profile-projection",
        status: "pass",
        matchCount: 0,
      }),
      expect.objectContaining({
        name: "runtime-profile-startup",
        status: "pass",
        matchCount: 0,
      }),
      expect.objectContaining({
        name: "runtime-profile-readiness",
        status: "pass",
        matchCount: 0,
      }),
      expect.objectContaining({
        name: "runtime-profile-mcp-config",
        status: "pass",
        matchCount: 0,
      }),
    ]);
    expect(report.tracks).toContainEqual(
      expect.objectContaining({
        id: "web-electron-presentation",
        checks: expect.arrayContaining([
          expect.objectContaining({
            label: "Offline shared renderer evidence is current",
            status: "pass",
            evidence: expect.stringContaining(
              "result=docs/upgrade/gates/presentation-render-evidence.json",
            ),
          }),
          expect.objectContaining({
            label: "Hydrated web/Electron visual QA evidence is current",
            status: "pass",
            evidence: expect.stringContaining(
              "result=docs/upgrade/gates/presentation-hydrated-visual-qa.json",
            ),
          }),
        ]),
      }),
    );
    expect(report.tracks).toContainEqual(
      expect.objectContaining({
        id: "harness-api-contracts",
        checks: expect.arrayContaining([
          expect.objectContaining({
            label: "Runtime profile, ready, and doctor scripts are exposed",
            status: "pass",
            evidence: "package.json scripts runtime:profile/runtime:ready/runtime:doctor/integration:gate",
          }),
          expect.objectContaining({
            label: "Runtime profile projection/startup avoids unrelated dev-server port",
            status: "pass",
            evidence: expect.stringContaining("forbiddenPort=5173"),
          }),
        ]),
      }),
    );
  });

  it("renders markdown and json reports", () => {
    const report = buildUpgradeReadinessReport({ profileName: "workbench-host" });
    const markdown = renderUpgradeReadinessReport(report, "markdown");
    const json = JSON.parse(renderUpgradeReadinessReport(report, "json"));

    expect(markdown).toContain("# Kirakira Upgrade Readiness");
    expect(markdown).not.toContain("## Advisory Warnings");
    expect(markdown).not.toContain("## Open Work");
    expect(markdown).toContain("EAM Mechanism Parity");
    expect(json.summary.status).toBe(report.summary.status);
    expect(json.openWork.length).toBe(report.openWork.length);
    expect(json.advisoryWarnings.length).toBe(report.advisoryWarnings.length);
    expect(json.gates.deepResearchLiveAdapters.status).toBe("pass");
    expect(json.gates.deepResearchLiveAdapters.liveGate.resultMatches).toBe(true);
    expect(json.gates.runtimeIntegration.status).toBe("passed");
    expect(json.gates.runtimeIntegration.evidence.childGatesPassed).toBe(true);
    expect(json.gates.presentationProjection.failures).toBe(0);
    expect(json.gates.presentationRenderEvidence.resultMatches).toBe(true);
    expect(json.gates.presentationHydratedVisualQa.resultMatches).toBe(true);
    expect(json.gates.harnessHardcoding.totalMatches).toBe(0);
  });
});
