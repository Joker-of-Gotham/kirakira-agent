import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildDeepResearchLiveAdaptersCommand,
  normalizeDeepResearchLiveAdaptersArgs,
} from "../../../scripts/deep-research-live-adapters.mjs";

describe("deep research live adapter gate", () => {
  it("parses the opt-in live command shape", () => {
    expect(
      normalizeDeepResearchLiveAdaptersArgs([
        "--profile",
        "workbench-host",
        "--live",
        "--timeout-ms",
        "120000",
      ]),
    ).toMatchObject({
      profileName: "workbench-host",
      live: true,
      timeoutMs: 120_000,
    });
  });

  it("builds a profile-gated plan without live mode by default", () => {
    const smoke = buildDeepResearchLiveAdaptersCommand(
      { profileName: "workbench-host", resultPath: null },
      {},
    );

    expect(smoke.profile).toBe("workbench-host");
    expect(smoke.live).toBe(false);
    expect(smoke.status).toBe("skipped");
    expect(smoke.gate).toBe("deep-research:live-adapters");
    expect(smoke.requiredSuites).toEqual(["file", "web", "mcp"]);
    expect(smoke.checks).toEqual([
      "deep-research:file-source",
      "deep-research:web-source",
      "deep-research:mcp-runtime-source",
      "deep-research:mcp-live-transports",
      "deep-research:mcp-kernel-research-events",
    ]);
    expect(smoke.unitContract.tests).toEqual([
      "test/unit/deep-research/file.test.ts",
      "test/unit/deep-research/web.test.ts",
      "test/unit/deep-research/mcp.test.ts",
      "test/unit/runtime-daemon/deep-research-mcp-source.test.ts",
    ]);
    expect(smoke.liveGate.tests).toEqual([
      "test/smoke/deep-research/live-adapters-smoke.test.ts",
      "test/smoke/runtime-daemon/deep-research-mcp-live-source-smoke.test.ts",
    ]);
    expect(smoke.liveGate.status).toBe("skipped");
    expect(JSON.stringify(smoke)).not.toContain("5173");
  });

  it("can mark the live gate externally passed for readiness reports", () => {
    const smoke = buildDeepResearchLiveAdaptersCommand(
      { profileName: "workbench-host", resultPath: null },
      { KIRAKIRA_DEEP_RESEARCH_LIVE_ADAPTERS_PASSED: "1" },
    );

    expect(smoke.status).toBe("passed");
    expect(smoke.liveGate.status).toBe("passed");
  });

  it("uses the dedicated gate profile environment override when no profile is passed", () => {
    const smoke = buildDeepResearchLiveAdaptersCommand(
      { resultPath: null },
      { KIRAKIRA_DEEP_RESEARCH_GATE_PROFILE: "test-host" },
    );

    expect(smoke.profile).toBe("test-host");
  });

  it("trusts a matching live evidence file for readiness reports", () => {
    const dir = mkdtempSync(join(tmpdir(), "kirakira-deep-research-smoke-"));
    const resultPath = join(dir, "deep-research-live-adapters.json");
    try {
      writeFileSync(
        resultPath,
        JSON.stringify({
          schemaVersion: 1,
          gate: "deep-research:live-adapters",
          profile: "workbench-host",
          status: "passed",
          passedAt: "2026-06-10T00:00:00.000Z",
          requiredSuites: ["file", "web", "mcp"],
          checks: [
            "deep-research:file-source",
            "deep-research:web-source",
            "deep-research:mcp-runtime-source",
            "deep-research:mcp-live-transports",
            "deep-research:mcp-kernel-research-events",
          ],
          unitTests: [
            "test/unit/deep-research/file.test.ts",
            "test/unit/deep-research/web.test.ts",
            "test/unit/deep-research/mcp.test.ts",
            "test/unit/runtime-daemon/deep-research-mcp-source.test.ts",
          ],
          liveTests: [
            "test/smoke/deep-research/live-adapters-smoke.test.ts",
            "test/smoke/runtime-daemon/deep-research-mcp-live-source-smoke.test.ts",
          ],
        }),
      );

      const smoke = buildDeepResearchLiveAdaptersCommand(
        { profileName: "workbench-host", resultPath },
        {},
      );

      expect(smoke.status).toBe("passed");
      expect(smoke.liveGate.status).toBe("passed");
      expect(smoke.evidence).toMatchObject({
        resultStatus: "passed",
        resultPassedAt: "2026-06-10T00:00:00.000Z",
        resultMatches: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not trust mismatched live evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "kirakira-deep-research-smoke-"));
    const resultPath = join(dir, "deep-research-live-adapters.json");
    try {
      writeFileSync(
        resultPath,
        JSON.stringify({
          schemaVersion: 1,
          gate: "deep-research:live-adapters",
          profile: "test-host",
          status: "passed",
          passedAt: "2026-06-10T00:00:00.000Z",
          requiredSuites: ["file", "web"],
          checks: [
            "deep-research:file-source",
            "deep-research:web-source",
          ],
          unitTests: [
            "test/unit/deep-research/file.test.ts",
            "test/unit/deep-research/web.test.ts",
          ],
          liveTests: [],
        }),
      );

      const smoke = buildDeepResearchLiveAdaptersCommand(
        { profileName: "workbench-host", resultPath },
        {},
      );

      expect(smoke.status).toBe("skipped");
      expect(smoke.evidence).toMatchObject({
        resultStatus: "passed",
        resultMatches: false,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
