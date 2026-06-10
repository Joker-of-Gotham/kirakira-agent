import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildPresentationRenderEvidenceReport,
  normalizePresentationRenderEvidenceArgs,
  readPresentationRenderEvidenceArtifact,
  renderPresentationRenderEvidenceReport,
  writePresentationRenderEvidenceArtifact,
} from "../../../scripts/presentation-render-evidence.js";

describe("presentation render evidence script", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses profile and artifact options", () => {
    expect(normalizePresentationRenderEvidenceArgs([
      "--profile",
      "workbench-host",
      "--write-result",
      "tmp/presentation-render/report.json",
      "--format",
      "markdown",
    ])).toMatchObject({
      profileName: "workbench-host",
      writeResultPath: expect.stringContaining("tmp"),
      noWriteResult: false,
      format: "markdown",
      help: false,
    });

    expect(normalizePresentationRenderEvidenceArgs(["--no-write-result"])).toMatchObject({
      noWriteResult: true,
    });
  });

  it("builds a profile-derived offline render report", () => {
    const report = buildPresentationRenderEvidenceReport({
      profileName: "workbench-host",
      noWriteResult: true,
    }, {});

    expect(report.profile).toBe("workbench-host");
    expect(report.status).toBe("passed");
    expect(report.summary).toMatchObject({
      failed: 0,
      total: 8,
    });
    expect(report.targets).toEqual([
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
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("writes and reads the durable render evidence artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "kirakira-render-evidence-"));
    tmpRoots.push(root);
    const artifactPath = join(root, "gates", "presentation-render-evidence.json");
    const report = buildPresentationRenderEvidenceReport({
      profileName: "workbench-host",
      writeResultPath: artifactPath,
    }, {});

    const outputPath = writePresentationRenderEvidenceArtifact(report, artifactPath);
    const artifact = readPresentationRenderEvidenceArtifact(outputPath);

    expect(outputPath).toBe(artifactPath);
    expect(artifact?.gate).toBe("presentation-render-evidence");
    expect(artifact?.status).toBe("passed");
    expect(artifact?.surfaces).toHaveLength(2);
    expect(artifact?.targets).toHaveLength(2);
    expect(readFileSync(outputPath, "utf8")).not.toContain("<main");
  });

  it("renders json and markdown summaries", () => {
    const report = buildPresentationRenderEvidenceReport({
      profileName: "workbench-host",
      noWriteResult: true,
    }, {});

    expect(JSON.parse(renderPresentationRenderEvidenceReport(report, "json")).status).toBe(
      "passed",
    );
    const markdown = renderPresentationRenderEvidenceReport(report, "markdown");
    expect(markdown).toContain("# Kirakira Presentation Render Evidence");
    expect(markdown).toContain("Status: passed");
    expect(markdown).toContain("Browser gateway");
    expect(markdown).toContain("Desktop IPC");
  });
});
