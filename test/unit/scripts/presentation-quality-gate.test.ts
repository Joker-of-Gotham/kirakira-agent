import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPresentationQualityReport,
  normalizePresentationQualityGateArgs,
  renderPresentationQualityReport,
  writePresentationQualityArtifact,
} from "../../../scripts/presentation-quality-gate.mjs";

describe("presentation quality gate", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses profile, format, and failure options", () => {
    expect(normalizePresentationQualityGateArgs([
      "--profile",
      "workbench-host",
      "--format",
      "json",
      "--artifact",
      "tmp/presentation-quality/workbench-host.json",
      "--fail-on-issues",
    ])).toEqual({
      profileName: "workbench-host",
      format: "json",
      artifactPath: "tmp/presentation-quality/workbench-host.json",
      failOnIssues: true,
      help: false,
    });
  });

  it("builds a profile-gated presentation report without live services", () => {
    const report = buildPresentationQualityReport({
      profileName: "workbench-host",
      env: {},
    });

    expect(report.profile).toBe("workbench-host");
    expect(report.summary).toMatchObject({
      status: "pass",
      failed: 0,
    });
    expect(report.readiness.webTarget).toBe("http://127.0.0.1:5183/");
    expect(report.readiness.desktopTarget).toBe("http://127.0.0.1:5174/");
    expect(report.readiness.checkNames).toContain("presentation:web");
    expect(report.readiness.checkNames).toContain("presentation:desktop");
    expect(report.checks.map((check) => check.id)).toEqual([
      "profile-web-target",
      "profile-desktop-target",
      "shared-design-tokens",
      "workbench-a11y-anchors",
      "presentation-surface-identity",
      "desktop-smoke-content-contract",
      "multi-view-ia-density",
      "visual-design-review-artifact",
      "visual-qa-hooks",
      "presentation-contract-doc",
    ]);
    expect(report.iaDensity.navigationViews).toEqual(["runs", "agents", "research", "systems"]);
    expect(report.iaDensity.inspectorTabs).toEqual(["memory", "research", "mcp", "artifacts"]);
    expect(report.iaDensity.detailMetricLabels.length).toBeGreaterThanOrEqual(9);
    expect(report.iaDensity.inspectorMetricLabels.length).toBeGreaterThanOrEqual(12);
    expect(report.iaDensity.rendererEntrypoints).toEqual([
      "createWorkbenchNavigationView",
      "createWorkbenchInspectorView",
      "createWorkbenchDetailViews",
    ]);
    expect(report.surfaceIdentity).toMatchObject({
      attribute: "data-kk-presentation-surface",
      surfaces: ["web", "desktop"],
      web: { declared: true },
      desktop: { declared: true },
      sharedWorkbenchAttribute: true,
    });
    expect(report.designReview.summary).toEqual({
      status: "pass",
      passed: 7,
      total: 7,
    });
    expect(report.designReview.viewports.map((viewport) => viewport.id)).toEqual([
      "mobile",
      "tablet",
      "desktop",
    ]);
    expect(report.designReview.scorecard.map((dimension) => dimension.id)).toEqual([
      "layout",
      "typography",
      "spacing",
      "color",
      "hierarchy",
      "consistency",
      "interaction-responsive",
    ]);
    expect(report.designReview.sourceSignals).toMatchObject({
      responsiveBreakpoints: expect.any(Number),
      focusVisibleRules: expect.any(Number),
      ariaLabels: expect.any(Number),
      emptyStates: expect.any(Number),
    });
  });

  it("renders markdown and json reports for readiness tooling", () => {
    const report = buildPresentationQualityReport({
      profileName: "workbench-host",
      env: {},
    });

    const markdown = renderPresentationQualityReport(report, "markdown");
    expect(markdown).toContain("# Kirakira Presentation Quality Gate");
    expect(markdown).toContain("Status: pass");
    expect(markdown).toContain("presentation:web=http://127.0.0.1:5183/");
    expect(markdown).toContain("Surfaces: web, desktop (data-kk-presentation-surface)");
    expect(markdown).toContain("IA density: 4 nav views, 4 inspector tabs");
    expect(markdown).toContain("Visual review: pass (7/7 dimensions passed)");
    expect(markdown).toContain("| Visual Dimension | Status | Evidence |");

    const parsed = JSON.parse(renderPresentationQualityReport(report, "json"));
    expect(parsed.summary.status).toBe("pass");
    expect(parsed.readiness.desktopTarget).toBe("http://127.0.0.1:5174/");
    expect(parsed.designReview.summary.status).toBe("pass");
  });

  it("writes a renderer-safe QA result artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "kirakira-presentation-"));
    tmpRoots.push(root);
    const artifactPath = join(root, "presentation-quality", "report.json");
    const report = buildPresentationQualityReport({
      profileName: "workbench-host",
      artifactPath,
      env: {},
    });

    const outputPath = writePresentationQualityArtifact(report);
    const artifact = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(outputPath).toBe(artifactPath);
    expect(artifact.profile).toBe("workbench-host");
    expect(artifact.summary.status).toBe("pass");
    expect(artifact.artifacts.reportPath).toBe(artifactPath);
    expect(artifact.iaDensity.navigationViews).toHaveLength(4);
    expect(artifact.surfaceIdentity.surfaces).toEqual(["web", "desktop"]);
    expect(artifact.designReview.viewports).toHaveLength(3);
    expect(artifact.designReview.scorecard).toHaveLength(7);
  });
});
