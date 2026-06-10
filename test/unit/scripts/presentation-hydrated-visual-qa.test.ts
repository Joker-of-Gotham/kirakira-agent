import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildPresentationHydratedVisualQaCommand,
  normalizePresentationHydratedVisualQaArgs,
  writePresentationHydratedVisualQaResult,
} from "../../../scripts/presentation-hydrated-visual-qa.mjs";

describe("presentation hydrated visual QA gate", () => {
  it("parses the profile-owned live command shape", () => {
    expect(
      normalizePresentationHydratedVisualQaArgs([
        "--gate",
        "presentation-hydrated-visual-qa",
        "--profile",
        "workbench-host",
        "--timeout-ms",
        "120000",
        "--skip-infra",
        "--live",
      ]),
    ).toMatchObject({
      gateName: "presentation-hydrated-visual-qa",
      profileName: "workbench-host",
      timeoutMs: 120_000,
      skipInfra: true,
      live: true,
    });
  });

  it("builds a skipped profile-derived visual QA plan without live mode", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-hydrated-visual-qa-missing-"));
    try {
      const command = buildPresentationHydratedVisualQaCommand(
        {
          gateName: "presentation-hydrated-visual-qa",
          profileName: "workbench-host",
          resultPath: join(tempRoot, "missing.json"),
          screenshotDir: join(tempRoot, "screenshots"),
          skipInfra: true,
        },
        {},
      );

      expect(command).toMatchObject({
        gate: "presentation-hydrated-visual-qa",
        gateSource: "runtime-profile.presentationHydratedVisualQaGates",
        profile: "workbench-host",
        live: false,
        status: "skipped",
        checks: expect.arrayContaining([
          "presentation:hydrated-web",
          "presentation:hydrated-desktop",
          "presentation:viewport-screenshots",
          "presentation:core-workbench-views",
        ]),
        surfaces: ["web", "desktop"],
      });
      expect(command.viewports.map((viewport) => viewport.id)).toEqual([
        "mobile",
        "tablet",
        "desktop",
      ]);
      expect(command.views.map((view) => [view.id, view.selector])).toEqual([
        ["runs", "workbench-view-runs"],
        ["agents", "workbench-view-agents"],
        ["research", "workbench-view-research"],
        ["systems", "workbench-view-systems"],
      ]);
      expect(command.targets).toMatchObject({
        web: "http://127.0.0.1:5183/",
        desktop: "http://127.0.0.1:5174/",
      });
      expect(JSON.stringify(command)).not.toContain("5173");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses gate and global live environment opt-ins", () => {
    expect(
      buildPresentationHydratedVisualQaCommand(
        {
          gateName: "presentation-hydrated-visual-qa",
          profileName: "workbench-host",
          resultPath: null,
        },
        { KIRAKIRA_PRESENTATION_HYDRATED_VISUAL_QA_LIVE: "1" },
      ).live,
    ).toBe(true);
    expect(
      buildPresentationHydratedVisualQaCommand(
        {
          gateName: "presentation-hydrated-visual-qa",
          profileName: "workbench-host",
          resultPath: null,
        },
        { KIRAKIRA_LIVE_E2E: "1" },
      ).live,
    ).toBe(true);
  });

  it("writes and replays durable visual QA evidence", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-hydrated-visual-qa-"));
    const resultPath = join(tempRoot, "presentation-hydrated-visual-qa.json");
    try {
      const command = buildPresentationHydratedVisualQaCommand(
        {
          gateName: "presentation-hydrated-visual-qa",
          profileName: "workbench-host",
          resultPath,
          screenshotDir: join(tempRoot, "screenshots"),
          skipInfra: true,
        },
        {},
      );
      const result = writePresentationHydratedVisualQaResult(
        command,
        fakeSurfaceResults(command),
        resultPath,
      );
      const stored = JSON.parse(readFileSync(resultPath, "utf8"));
      const replay = buildPresentationHydratedVisualQaCommand(
        {
          gateName: "presentation-hydrated-visual-qa",
          profileName: "workbench-host",
          resultPath,
          screenshotDir: join(tempRoot, "screenshots"),
          skipInfra: true,
        },
        {},
      );

      expect(result).toMatchObject({
        schemaVersion: 1,
        gate: "presentation-hydrated-visual-qa",
        profile: "workbench-host",
        status: "passed",
        surfaces: ["web", "desktop"],
      });
      expect(stored).toMatchObject(result);
      expect(replay.status).toBe("passed");
      expect(replay.liveGate.status).toBe("passed");
      expect(replay.evidence).toMatchObject({
        resultStatus: "passed",
        resultMatches: true,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses profile endpoint overrides instead of hard-coded ports", () => {
    const command = buildPresentationHydratedVisualQaCommand(
      {
        gateName: "presentation-hydrated-visual-qa",
        profileName: "workbench-host",
        resultPath: null,
        skipInfra: true,
      },
      {
        KIRAKIRA_WEB_PORT: "5199",
        KIRAKIRA_DESKTOP_RENDERER_PORT: "5179",
      },
    );

    expect(command.targets).toMatchObject({
      web: "http://127.0.0.1:5199/",
      desktop: "http://127.0.0.1:5179/",
    });
    expect(JSON.stringify(command)).not.toContain("5183");
    expect(JSON.stringify(command)).not.toContain("5174");
    expect(JSON.stringify(command)).not.toContain("5173");
  });
});

function fakeSurfaceResults(command: ReturnType<typeof buildPresentationHydratedVisualQaCommand>) {
  return command.surfaces.map((surface) => ({
    schemaVersion: 1,
    surface,
    target: command.targets[surface],
    status: "passed",
    viewports: command.viewports.map((viewport) => ({
      viewport,
      status: "passed",
      screenshotPath: join(command.screenshotDir, `${surface}-${viewport.id}.png`),
      screenshot: {
        width: viewport.width,
        height: viewport.height,
        pngBytes: 32000,
        sampledColors: 32,
        alphaPixels: 512,
        nonblank: true,
      },
      consoleMessages: [],
      pageFailures: [],
      probe: {
        readyState: "complete",
        title: "Kirakira Agent",
        rootChildCount: 1,
        bodyTextLength: 2000,
        shellFound: true,
        surface,
        views: command.views.map((view) => ({
          id: view.id,
          selector: view.selector,
          navFound: true,
          workspaceFound: true,
          activeFound: true,
          shellActive: true,
          currentNavCount: 1,
          textLength: 200,
        })),
        overflow: {
          documentHorizontalPixels: 0,
          clippedText: [],
        },
      },
      failures: [],
    })),
    failures: [],
  }));
}
