import { describe, expect, it } from "vitest";
import {
  buildPresentationQualityReport,
  normalizePresentationQualityGateArgs,
  renderPresentationQualityReport,
} from "../../../scripts/presentation-quality-gate.mjs";

describe("presentation quality gate", () => {
  it("parses profile, format, and failure options", () => {
    expect(normalizePresentationQualityGateArgs([
      "--profile",
      "workbench-host",
      "--format",
      "json",
      "--fail-on-issues",
    ])).toEqual({
      profileName: "workbench-host",
      format: "json",
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
      "desktop-smoke-content-contract",
      "visual-qa-hooks",
      "presentation-contract-doc",
      "no-forbidden-dev-port",
    ]);
    expect(JSON.stringify(report.readiness)).not.toContain("5173");
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

    const parsed = JSON.parse(renderPresentationQualityReport(report, "json"));
    expect(parsed.summary.status).toBe("pass");
    expect(parsed.readiness.desktopTarget).toBe("http://127.0.0.1:5174/");
  });
});
