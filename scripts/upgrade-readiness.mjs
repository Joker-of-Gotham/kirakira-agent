import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildEamParityAudit } from "./eam-parity-audit.mjs";
import { buildDeepResearchLiveAdaptersCommand } from "./deep-research-live-adapters.mjs";
import { buildMemoryPersistenceSmokeCommand } from "./memory-persistence-smoke.mjs";
import { buildPresentationHydratedVisualQaCommand } from "./presentation-hydrated-visual-qa.mjs";
import { buildRuntimeFullLifecycleGateCommand } from "./runtime-full-lifecycle-gate.mjs";
import { buildRuntimeIntegrationGateCommand } from "./runtime-integration-gate.mjs";
import {
  buildRuntimeProfileProjection,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = resolve(SCRIPT_DIR, "..");
const DEFAULT_PROFILE = "workbench-host";
const FORBIDDEN_PORT_TEXT = "5173";
const PRESENTATION_RENDER_EVIDENCE_PATH =
  "docs/upgrade/gates/presentation-render-evidence.json";
const PRESENTATION_HYDRATED_VISUAL_QA_PATH =
  "docs/upgrade/gates/presentation-hydrated-visual-qa.json";
const RUNTIME_FULL_LIFECYCLE_GATE_PATH =
  "docs/upgrade/gates/runtime-full-lifecycle-gate.json";

export function normalizeUpgradeReadinessArgs(argv = []) {
  const options = {
    workspaceRoot: DEFAULT_WORKSPACE,
    profileName: DEFAULT_PROFILE,
    format: "markdown",
    writePath: undefined,
    failOnIssues: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--workspace") {
      options.workspaceRoot = resolve(readRequiredValue(argv, index));
      index += 1;
    } else if (arg === "--profile") {
      options.profileName = readRequiredValue(argv, index);
      index += 1;
    } else if (arg === "--format") {
      const value = readRequiredValue(argv, index);
      if (value !== "json" && value !== "markdown") {
        throw new Error(`Unsupported --format value: ${value}`);
      }
      options.format = value;
      index += 1;
    } else if (arg === "--write") {
      options.writePath = resolve(readRequiredValue(argv, index));
      index += 1;
    } else if (arg === "--fail-on-issues") {
      options.failOnIssues = true;
    } else if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function buildUpgradeReadinessReport(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? DEFAULT_WORKSPACE);
  const profileName = options.profileName ?? DEFAULT_PROFILE;
  const packageJson = readJson(join(workspaceRoot, "package.json"));
  const config = loadRuntimeProfiles(join(workspaceRoot, "configs", "runtime", "profiles.json"));
  const profile = resolveRuntimeProfile(profileName, config, {});
  const projection = buildRuntimeProfileProjection(profile, { config });
  const memoryPersistenceSmoke = buildMemoryPersistenceSmokeCommand(
    { profileName: "test-host" },
    options.env ?? process.env,
  );
  const deepResearchLiveAdapters = buildDeepResearchLiveAdapterGate(
    workspaceRoot,
    profileName,
    options.env ?? process.env,
  );
  const runtimeIntegrationGate = buildRuntimeIntegrationGateCommand(
    { gateName: "upgrade" },
    options.env ?? process.env,
  );
  const runtimeFullLifecycleGate = buildRuntimeFullLifecycleReadinessGate(
    workspaceRoot,
    profile.name,
    options.env ?? process.env,
  );
  const presentationProjection = buildPresentationProjectionGate(projection);
  const presentationRenderEvidence = buildPresentationRenderEvidenceGate(
    workspaceRoot,
    profile.name,
  );
  const presentationHydratedVisualQa = buildPresentationHydratedVisualQaGate(
    workspaceRoot,
    profile.name,
    options.env ?? process.env,
    config,
  );
  const harnessHardcoding = buildHarnessHardcodingGate(projection);
  const parity = buildEamParityAudit({
    workspaceRoot,
    referenceRoot: join(workspaceRoot, "reference_project", "eam-agent"),
    depth: "files",
  });

  const context = {
    workspaceRoot,
    packageJson,
    profile,
    projection,
    parity,
    memoryPersistenceSmoke,
    deepResearchLiveAdapters,
    runtimeIntegrationGate,
    runtimeFullLifecycleGate,
    presentationProjection,
    presentationRenderEvidence,
    presentationHydratedVisualQa,
    harnessHardcoding,
  };
  const tracks = [
    eamMechanismTrack(context),
    presentationTrack(context),
    harnessApiTrack(context),
    ecosystemTrack(context),
  ].map(scoreTrack);
  const openWork = buildOpenWork(tracks, parity);
  const advisories = buildAdvisoryWarnings(tracks);
  const totals = tracks.reduce(
    (summary, track) => {
      summary.pass += track.summary.pass;
      summary.warn += track.summary.warn;
      summary.fail += track.summary.fail;
      summary.checks += track.summary.checks;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0, checks: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    profile: profile.name,
    summary: {
      ...totals,
      score: scoreFromCounts(totals),
      status: totals.fail > 0 ? "fail" : totals.warn > 0 ? "warn" : "pass",
      openWork: openWork.length,
      advisoryWarnings: advisories.length,
    },
    tracks,
    gates: {
      memoryPersistence: memoryPersistenceSmoke,
      deepResearchLiveAdapters,
      runtimeIntegration: runtimeIntegrationGate,
      runtimeFullLifecycle: runtimeFullLifecycleGate,
      presentationProjection,
      presentationRenderEvidence,
      presentationHydratedVisualQa,
      harnessHardcoding,
    },
    advisoryWarnings: advisories,
    openWork,
  };
}

export function renderUpgradeReadinessReport(report, format = "markdown") {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;

  const lines = [
    "# Kirakira Upgrade Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Profile: \`${report.profile}\``,
    `Workspace: \`${toPosixPath(report.workspaceRoot)}\``,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Score: ${report.summary.score}%`,
    `- Checks: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`,
    `- Open work items: ${report.summary.openWork}`,
    `- Advisory warnings: ${report.summary.advisoryWarnings}`,
    "",
  ];

  if (report.advisoryWarnings.length > 0) {
    lines.push("## Advisory Warnings", "");
    lines.push("| Track | Status | Item | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const item of report.advisoryWarnings) {
      lines.push(
        `| ${escapeTableCell(item.track)} | ${item.status} | ${escapeTableCell(item.item)} | ${escapeTableCell(item.evidence)} |`,
      );
    }
    lines.push("");
  }

  if (report.openWork.length > 0) {
    lines.push("## Open Work", "");
    lines.push("| Track | Status | Item | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const item of report.openWork) {
      lines.push(
        `| ${escapeTableCell(item.track)} | ${item.status} | ${escapeTableCell(item.item)} | ${escapeTableCell(item.evidence)} |`,
      );
    }
    lines.push("");
  }

  for (const track of report.tracks) {
    lines.push(`## ${track.title}`, "");
    lines.push(`Score: ${track.summary.score}%`);
    lines.push("");
    lines.push("| Status | Check | Evidence |");
    lines.push("| --- | --- | --- |");
    for (const item of track.checks) {
      lines.push(`| ${item.status} | ${escapeTableCell(item.label)} | ${escapeTableCell(item.evidence)} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function buildOpenWork(tracks, parity) {
  const readinessItems = tracks.flatMap((track) =>
    track.checks
      .filter((check) => check.status !== "pass")
      .filter((check) => check.actionable !== false)
      .map((check) => ({
        track: track.title,
        status: check.status,
        item: check.label,
        evidence: check.evidence,
      })),
  );

  const behaviorItems = (parity.behaviorParity?.checks ?? [])
    .filter((check) => check.status !== "covered")
    .flatMap((check) => {
      const gaps =
        check.remainingGaps.length > 0
          ? check.remainingGaps
          : [`Behavior parity check remains ${check.status}`];
      return gaps.map((gap) => ({
        track: "EAM Mechanism Parity",
        status: check.status === "partial" ? "warn" : "fail",
        item: `${check.targetName}: ${gap}`,
        evidence: `${check.classification}; behavior=${check.status}`,
      }));
    });

  return [...readinessItems, ...behaviorItems];
}

function buildAdvisoryWarnings(tracks) {
  return tracks.flatMap((track) =>
    track.checks
      .filter((check) => check.status !== "pass")
      .filter((check) => check.actionable === false)
      .map((check) => ({
        track: track.title,
        status: check.status,
        item: check.label,
        evidence: check.evidence,
      })),
  );
}

function eamMechanismTrack({ workspaceRoot, parity, deepResearchLiveAdapters }) {
  return {
    id: "eam-mechanism-parity",
    title: "EAM Mechanism Parity",
    checks: [
      passFail(
        "EAM reference checkout exists",
        existsSync(join(workspaceRoot, "reference_project", "eam-agent")),
        "reference_project/eam-agent is available for current-state comparison",
      ),
      passFail(
        "No missing EAM package/doc directories",
        parity.summary.missing === 0,
        `missing=${parity.summary.missing}, drift=${parity.summary.drift}, extra=${parity.summary.extra}`,
      ),
      advisoryWarnIf(
        "File-level mechanism drift has behavior classifications",
        parity.summary.drift === 0 || behaviorDriftClosed(parity.behaviorParity),
        behaviorParityEvidence(parity),
      ),
      passFail(
        "File-level parity audit is enabled",
        parity.depth === "files" && parity.sections.every((section) =>
          section.rows.every((row) => row.status === "missing" || row.fileAudit !== undefined),
        ),
        `depth=${parity.depth}`,
      ),
      deepResearchLiveAdapterCheck(deepResearchLiveAdapters),
    ],
  };
}

function buildDeepResearchLiveAdapterGate(workspaceRoot, profileName, env) {
  const command = buildDeepResearchLiveAdaptersCommand({ profileName }, env);
  const suites = command.suites.map((suite) => {
    const sourceExists = existsSync(join(workspaceRoot, suite.source));
    const tests = suite.unitTests.map((testPath) => ({
      path: testPath,
      exists: existsSync(join(workspaceRoot, testPath)),
    }));
    const covered = sourceExists && tests.every((test) => test.exists);
    return {
      ...suite,
      sourceExists,
      tests,
      covered,
    };
  });
  const coveredSuites = suites.filter((suite) => suite.covered).map((suite) => suite.id);
  const missingSuites = suites.filter((suite) => !suite.covered).map((suite) => suite.id);
  const resultStatus = command.evidence?.resultStatus;
  const resultMatches = command.evidence?.resultMatches === true;
  const livePassed = command.status === "passed" && resultMatches;
  const explicitFailed = resultStatus !== undefined && !resultMatches;
  const status =
    missingSuites.length > 0 || explicitFailed
      ? "fail"
      : livePassed
        ? "pass"
        : "warn";
  return {
    status,
    gate: command.gate,
    gateSource: command.gateSource,
    profile: command.profile,
    requiredSuites: command.requiredSuites,
    coveredSuites,
    missingSuites,
    suites,
    liveGate: {
      resultPath: command.evidence?.resultPath ?? "docs/upgrade/gates/deep-research-live-adapters.json",
      status: resultStatus ?? "missing",
      resultMatches,
      unitTests: command.unitContract.tests,
      liveTests: command.liveGate.tests,
    },
    evidence: [
      `covered=${coveredSuites.join(",") || "none"}`,
      `missing=${missingSuites.join(",") || "none"}`,
      `liveGate=${resultStatus ?? "missing"}`,
      `resultMatches=${String(resultMatches)}`,
      `result=${command.evidence?.resultPath ?? "missing"}`,
    ].join("; "),
  };
}

function deepResearchLiveAdapterCheck(gate) {
  return {
    label: "Deep research live adapter suites are evidenced",
    status: gate.status === "pass" ? "pass" : gate.status === "fail" ? "fail" : "warn",
    evidence: gate.evidence,
    ...(gate.status === "warn" ? { actionable: false } : {}),
  };
}

function behaviorDriftClosed(behaviorParity) {
  if (!behaviorParity) return false;
  return (
    behaviorParity.summary.driftRows.unchecked === 0 &&
    (behaviorParity.summary.status.partial ?? 0) === 0 &&
    (behaviorParity.summary.status.gap ?? 0) === 0 &&
    (behaviorParity.summary.status.unknown ?? 0) === 0
  );
}

function behaviorParityEvidence(parity) {
  const behaviorParity = parity.behaviorParity;
  if (!behaviorParity) {
    return `drift=${parity.summary.drift}; remaining drift requires subsystem-specific behavior checks`;
  }
  const status = behaviorParity.summary.status;
  const classification = behaviorParity.summary.classification;
  return [
    `drift=${parity.summary.drift}`,
    `classified=${behaviorParity.summary.driftRows.checked}/${behaviorParity.summary.driftRows.total}`,
    `covered=${status.covered ?? 0}`,
    `partial=${status.partial ?? 0}`,
    `gap=${status.gap ?? 0}`,
    `intentional=${classification["intentional-kirakira-extension"] ?? 0}`,
  ].join(", ");
}

function presentationTrack({
  workspaceRoot,
  packageJson,
  presentationProjection,
  presentationRenderEvidence,
  presentationHydratedVisualQa,
}) {
  const webTarget = presentationProjection.targets.find((target) => target.surface === "web");
  const desktopTarget = presentationProjection.targets.find(
    (target) => target.surface === "desktop",
  );
  return {
    id: "web-electron-presentation",
    title: "Web + Electron Presentation",
    checks: [
      passFail(
        "Web app package exists",
        existsSync(join(workspaceRoot, "apps", "web", "package.json")),
        "apps/web/package.json",
      ),
      passFail(
        "Desktop app package exists",
        existsSync(join(workspaceRoot, "apps", "desktop", "package.json")),
        "apps/desktop/package.json",
      ),
      passFail(
        "Shared frontend packages exist",
        existsSync(join(workspaceRoot, "packages", "frontend-app", "package.json")) &&
          existsSync(join(workspaceRoot, "packages", "frontend-core", "package.json")),
        "packages/frontend-app and packages/frontend-core",
      ),
      passFail(
        "Profile owns Kirakira web URL",
        webTarget?.status === "pass",
        presentationTargetEvidence(webTarget),
      ),
      passFail(
        "Profile owns desktop renderer URL",
        desktopTarget?.status === "pass",
        presentationTargetEvidence(desktopTarget),
      ),
      passFail(
        "Root workbench scripts exist",
        hasScripts(packageJson, ["start:web", "start:desktop", "e2e:workbench"]),
        "start:web, start:desktop, e2e:workbench",
      ),
      passFail(
        "Offline shared renderer evidence is current",
        presentationRenderEvidence.status === "pass",
        presentationRenderEvidence.evidence,
      ),
      passFail(
        "Hydrated web/Electron visual QA evidence is current",
        presentationHydratedVisualQa.status === "pass",
        presentationHydratedVisualQa.evidence,
      ),
    ],
  };
}

function buildPresentationHydratedVisualQaGate(workspaceRoot, profileName, env, config) {
  const fastGateEntry = fastPresentationHydratedVisualQaEntry(config);
  const commandEnv = { ...env, ...(fastGateEntry.env ?? {}) };
  const command = buildPresentationHydratedVisualQaCommand(
    {
      gateName: fastGateEntry.gate ?? "presentation-hydrated-visual-qa",
      profileName,
      skipInfra: fastGateEntry.skipInfra === true,
      skipDaemon: fastGateEntry.skipDaemon === true,
    },
    commandEnv,
  );
  const resultPath = join(workspaceRoot, PRESENTATION_HYDRATED_VISUAL_QA_PATH);
  if (!existsSync(resultPath)) {
    return {
      status: "fail",
      resultPath: PRESENTATION_HYDRATED_VISUAL_QA_PATH,
      resultStatus: "missing",
      resultMatches: false,
      evidence: `result=${PRESENTATION_HYDRATED_VISUAL_QA_PATH}; status=missing`,
    };
  }
  const artifact = readJson(resultPath);
  const surfaces = Array.isArray(artifact.surfaces) ? artifact.surfaces : [];
  const viewports = Array.isArray(artifact.viewports) ? artifact.viewports : [];
  const views = Array.isArray(artifact.views) ? artifact.views : [];
  const surfaceResults = Array.isArray(artifact.surfaceResults) ? artifact.surfaceResults : [];
  const surfaceNames = surfaces.map((surface) => String(surface)).sort();
  const viewportIds = viewports.map((viewport) => viewport.id).sort();
  const viewIds = views.map((view) => view.id).sort();
  const screenshots = surfaceResults.flatMap((surface) => surface.viewports ?? []);
  const consoleErrors = screenshots.reduce(
    (total, viewport) => total + (viewport.consoleMessages ?? []).filter(consoleMessageIsError).length,
    0,
  );
  const pageErrors = screenshots.reduce(
    (total, viewport) => total + (viewport.pageFailures ?? []).length,
    0,
  );
  const overflowViolations = screenshots.reduce(
    (total, viewport) =>
      total +
      ((viewport.probe?.overflow?.documentHorizontalPixels ?? 0) > 2 ? 1 : 0) +
      (viewport.probe?.overflow?.clippedText?.length ?? 0),
    0,
  );
  const nonblankScreenshots = screenshots.filter((viewport) => viewport.screenshot?.nonblank === true).length;
  const resultMatches =
    artifact.gate === "presentation-hydrated-visual-qa" &&
    artifact.profile === profileName &&
    artifact.status === "passed" &&
    command.evidence?.resultMatches === true &&
    surfaceNames.includes("desktop") &&
    surfaceNames.includes("web") &&
    viewportIds.includes("desktop") &&
    viewportIds.includes("mobile") &&
    viewportIds.includes("tablet") &&
    viewIds.includes("agents") &&
    viewIds.includes("research") &&
    viewIds.includes("runs") &&
    viewIds.includes("systems") &&
    screenshots.length >= surfaceNames.length * viewportIds.length &&
    nonblankScreenshots === screenshots.length &&
    consoleErrors === 0 &&
    pageErrors === 0 &&
    overflowViolations === 0 &&
    !JSON.stringify(artifact).includes(FORBIDDEN_PORT_TEXT);
  return {
    status: resultMatches ? "pass" : "fail",
    resultPath: PRESENTATION_HYDRATED_VISUAL_QA_PATH,
    profile: artifact.profile ?? null,
    resultStatus: artifact.status ?? "missing",
    resultMatches,
    surfaces: surfaceNames,
    viewports: viewportIds,
    views: viewIds,
    screenshots: screenshots.length,
    nonblankScreenshots,
    consoleErrors,
    pageErrors,
    overflowViolations,
    containsForbiddenPort: JSON.stringify(artifact).includes(FORBIDDEN_PORT_TEXT),
    evidence: [
      `result=${PRESENTATION_HYDRATED_VISUAL_QA_PATH}`,
      `status=${artifact.status ?? "missing"}`,
      `profile=${artifact.profile ?? "missing"}`,
      `surfaces=${surfaceNames.join(",") || "none"}`,
      `viewports=${viewportIds.join(",") || "none"}`,
      `views=${viewIds.join(",") || "none"}`,
      `screenshots=${nonblankScreenshots}/${screenshots.length}`,
      `consoleErrors=${consoleErrors}`,
      `pageErrors=${pageErrors}`,
      `overflow=${overflowViolations}`,
      `forbiddenPort=${JSON.stringify(artifact).includes(FORBIDDEN_PORT_TEXT) ? "present" : "absent"}`,
      `execution=${artifact.execution?.mode ?? "missing"}/${artifact.execution?.skipInfra === true ? "skipInfra" : "infra"}/${artifact.execution?.skipDaemon === true ? "skipDaemon" : "daemon"}`,
    ].join("; "),
  };
}

function fastPresentationHydratedVisualQaEntry(config) {
  const gates = config?.integrationGates?.upgrade?.gates;
  const entry = Array.isArray(gates)
    ? gates.find((candidate) => candidate?.kind === "presentation-hydrated-visual-qa")
    : undefined;
  if (!entry || typeof entry !== "object") {
    return {};
  }
  return {
    gate: typeof entry.gate === "string" ? entry.gate : undefined,
    skipInfra: entry.skipInfra === true,
    skipDaemon: entry.skipDaemon === true,
    env: entry.env && typeof entry.env === "object" && !Array.isArray(entry.env)
      ? Object.fromEntries(
          Object.entries(entry.env).filter(([, value]) => typeof value === "string"),
        )
      : {},
  };
}

function buildRuntimeFullLifecycleReadinessGate(workspaceRoot, profileName, env) {
  const command = buildRuntimeFullLifecycleGateCommand(
    { gateName: "runtime-full-lifecycle", profileName },
    env,
  );
  const resultPath = join(workspaceRoot, RUNTIME_FULL_LIFECYCLE_GATE_PATH);
  if (!existsSync(resultPath)) {
    return {
      status: "warn",
      resultPath: RUNTIME_FULL_LIFECYCLE_GATE_PATH,
      profile: profileName,
      resultStatus: "missing",
      resultMatches: false,
      preflightStatus: "missing",
      checks: command.checks,
      lifecycleSteps: command.lifecycleSteps,
      targets: Object.keys(command.targets ?? {}).sort(),
      evidence: [
        `result=${RUNTIME_FULL_LIFECYCLE_GATE_PATH}`,
        "status=missing",
        `profile=${profileName}`,
        "preflight=missing",
        "fullLifecycle=not-run",
      ].join("; "),
    };
  }
  const artifact = readJson(resultPath);
  const targetNames = Object.keys(artifact.targets ?? {}).sort();
  const lifecycleSteps = Array.isArray(artifact.lifecycleSteps) ? artifact.lifecycleSteps : [];
  const checks = Array.isArray(artifact.checks) ? artifact.checks : [];
  const preflight = artifact.preflight && typeof artifact.preflight === "object"
    ? artifact.preflight
    : {};
  const failedPreflight = Array.isArray(preflight.checks)
    ? preflight.checks.find((check) => check?.status === "failed")
    : undefined;
  const preflightStatus = preflight.status ?? "missing";
  const preflightCode = preflight.code ?? failedPreflight?.code;
  const preflightGuidance = preflight.guidance ?? failedPreflight?.guidance;
  const preflightReference = preflight.reference ?? failedPreflight?.reference;
  const failedPreflightCheck = preflight.failedCheck ?? failedPreflight?.id;
  const containsForbiddenPort = JSON.stringify(artifact).includes(FORBIDDEN_PORT_TEXT);
  const resultMatches =
    artifact.gate === "runtime-full-lifecycle" &&
    artifact.profile === profileName &&
    artifact.integrationGate === "full-lifecycle" &&
    artifact.status === "passed" &&
    command.evidence?.resultMatches === true &&
    preflightStatus === "passed" &&
    lifecycleSteps.includes("docker-compose:up-wait") &&
    lifecycleSteps.includes("workbench:desktop-electron") &&
    checks.includes("runtime-lifecycle:hydrated-visual-qa") &&
    targetNames.includes("daemon:browser-gateway") &&
    targetNames.includes("presentation:web") &&
    targetNames.includes("presentation:desktop") &&
    !containsForbiddenPort;
  const status = resultMatches
    ? "pass"
    : artifact.status === "blocked" || preflightStatus === "failed"
      ? "warn"
      : "fail";
  return {
    status,
    resultPath: RUNTIME_FULL_LIFECYCLE_GATE_PATH,
    profile: artifact.profile ?? null,
    resultStatus: artifact.status ?? "missing",
    resultMatches,
    preflightStatus,
    checks,
    lifecycleSteps,
    targets: targetNames,
    containsForbiddenPort,
    preflightCode,
    preflightGuidance,
    preflightReference,
    failedPreflightCheck,
    evidence: [
      `result=${RUNTIME_FULL_LIFECYCLE_GATE_PATH}`,
      `status=${artifact.status ?? "missing"}`,
      `profile=${artifact.profile ?? "missing"}`,
      `preflight=${preflightStatus}`,
      ...(failedPreflightCheck ? [`failedPreflight=${failedPreflightCheck}`] : []),
      ...(preflightCode ? [`preflightCode=${preflightCode}`] : []),
      ...(preflightGuidance ? [`guidance=${preflightGuidance}`] : []),
      `steps=${lifecycleSteps.join(",") || "none"}`,
      `targets=${targetNames.join(",") || "none"}`,
      `forbiddenPort=${containsForbiddenPort ? "present" : "absent"}`,
    ].join("; "),
  };
}

function consoleMessageIsError(message) {
  const level = String(message?.level ?? "").toLowerCase();
  if (
    String(message?.message ?? "").includes("Electron Security Warning (Insecure Content-Security-Policy)") &&
    String(message?.source ?? "").startsWith("node:electron")
  ) {
    return false;
  }
  return level === "2" || level === "3" || level.includes("error");
}

function buildPresentationRenderEvidenceGate(workspaceRoot, profileName) {
  const resultPath = join(workspaceRoot, PRESENTATION_RENDER_EVIDENCE_PATH);
  if (!existsSync(resultPath)) {
    return {
      status: "fail",
      resultPath: PRESENTATION_RENDER_EVIDENCE_PATH,
      evidence: `result=${PRESENTATION_RENDER_EVIDENCE_PATH}; status=missing`,
    };
  }
  const artifact = readJson(resultPath);
  const surfaces = Array.isArray(artifact.surfaces) ? artifact.surfaces : [];
  const surfaceNames = surfaces.map((surface) => surface.surface).sort();
  const hasRequiredSurfaces =
    surfaceNames.includes("desktop") && surfaceNames.includes("web");
  const transportCalls = surfaces.reduce(
    (total, surface) =>
      total +
      Object.values(surface.transportCalls ?? {}).reduce(
        (surfaceTotal, count) => surfaceTotal + Number(count ?? 0),
        0,
      ),
    0,
  );
  const targets = Array.isArray(artifact.targets) ? artifact.targets : [];
  const targetsPass =
    targets.length >= 2 && targets.every((target) => target.status === "pass");
  const containsForbiddenPort = JSON.stringify(artifact).includes(FORBIDDEN_PORT_TEXT);
  const resultMatches =
    artifact.gate === "presentation-render-evidence" &&
    artifact.profile === profileName &&
    artifact.status === "passed" &&
    artifact.summary?.failed === 0 &&
    hasRequiredSurfaces &&
    transportCalls === 0 &&
    targetsPass &&
    !containsForbiddenPort;
  return {
    status: resultMatches ? "pass" : "fail",
    resultPath: PRESENTATION_RENDER_EVIDENCE_PATH,
    profile: artifact.profile ?? null,
    resultStatus: artifact.status ?? "missing",
    resultMatches,
    surfaces: surfaceNames,
    transportCalls,
    targetsPass,
    containsForbiddenPort,
    evidence: [
      `result=${PRESENTATION_RENDER_EVIDENCE_PATH}`,
      `status=${artifact.status ?? "missing"}`,
      `profile=${artifact.profile ?? "missing"}`,
      `surfaces=${surfaceNames.join(",") || "none"}`,
      `transportCalls=${transportCalls}`,
      `targets=${targetsPass ? "pass" : "fail"}`,
      `forbiddenPort=${containsForbiddenPort ? "present" : "absent"}`,
    ].join("; "),
  };
}

function buildPresentationProjectionGate(projection) {
  const targets = [
    {
      surface: "web",
      readinessName: "presentation:web",
      envName: "KIRAKIRA_WEB_URL",
    },
    {
      surface: "desktop",
      readinessName: "presentation:desktop",
      envName: "KIRAKIRA_DESKTOP_RENDERER_URL",
    },
  ].map((target) => {
    const readiness = readinessTarget(projection, target.readinessName);
    const env = runtimeProfileEnvValue(projection, target.envName);
    return {
      ...target,
      readinessTarget: readiness ?? null,
      envTarget: env ?? null,
      status:
        readiness && env && normalizedUrl(readiness) === normalizedUrl(env)
          ? "pass"
          : "fail",
    };
  });
  const failures = targets.filter((target) => target.status !== "pass").length;
  return {
    status: failures === 0 ? "pass" : "fail",
    source: "runtime-profile-projection",
    failures,
    targets,
    evidence: targets.map(presentationTargetEvidence).join("; "),
  };
}

function runtimeProfileEnvValue(projection, name) {
  return projection.fragments?.env?.values?.[name];
}

function normalizedUrl(value) {
  return String(value).replace(/\/+$/, "");
}

function presentationTargetEvidence(target) {
  if (!target) return "target=missing";
  return [
    `${target.readinessName}=${target.readinessTarget ?? "missing"}`,
    `${target.envName}=${target.envTarget ?? "missing"}`,
    `status=${target.status}`,
  ].join(", ");
}

function buildHarnessHardcodingGate(projection) {
  const scopes = [
    { name: "runtime-profile-projection", payload: projection },
    { name: "runtime-profile-startup", payload: projection.fragments?.startup },
    { name: "runtime-profile-readiness", payload: projection.fragments?.readiness },
    { name: "runtime-profile-mcp-config", payload: projection.fragments?.mcpConfig },
  ].map((scope) => {
    const serialized = JSON.stringify(scope.payload ?? null);
    const matchCount = countStringOccurrences(serialized, FORBIDDEN_PORT_TEXT);
    return {
      name: scope.name,
      status: matchCount === 0 ? "pass" : "fail",
      matchCount,
      bytes: serialized.length,
    };
  });
  const totalMatches = scopes.reduce((sum, scope) => sum + scope.matchCount, 0);
  return {
    status: totalMatches === 0 ? "pass" : "fail",
    forbiddenPort: Number(FORBIDDEN_PORT_TEXT),
    forbiddenToken: FORBIDDEN_PORT_TEXT,
    totalMatches,
    scopes,
    evidence: hardcodingEvidence(scopes, totalMatches),
  };
}

function countStringOccurrences(value, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = value.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = value.indexOf(needle, index + needle.length);
  }
  return count;
}

function hardcodingEvidence(scopes, totalMatches) {
  return [
    `forbiddenPort=${FORBIDDEN_PORT_TEXT}`,
    `matches=${totalMatches}`,
    `scopes=${scopes.map((scope) => `${scope.name}:${scope.matchCount}`).join(",")}`,
  ].join("; ");
}

function harnessApiTrack({ packageJson, projection, harnessHardcoding }) {
  return {
    id: "harness-api-contracts",
    title: "Harness / SDK / API Contracts",
    checks: [
      passFail(
        "Runtime profile, ready, and doctor scripts are exposed",
        hasScripts(packageJson, [
          "runtime:profile",
          "runtime:ready",
          "runtime:doctor",
          "integration:gate",
        ]),
        "package.json scripts runtime:profile/runtime:ready/runtime:doctor/integration:gate",
      ),
      passFail(
        "Profile projection includes readiness, MCP, and memory fragments",
        Boolean(
          projection.fragments?.readiness &&
            projection.fragments?.mcpConfig &&
            projection.fragments?.memoryStack,
        ),
        `fragments=${Object.keys(projection.fragments ?? {}).join(",")}`,
      ),
      passFail(
        "MCP config fragment renders server descriptors",
        Object.keys(projection.fragments?.mcpConfig?.config?.mcpServers ?? {}).length > 0,
        `mcpServers=${Object.keys(projection.fragments?.mcpConfig?.config?.mcpServers ?? {}).length}`,
      ),
      passFail(
        "Runtime profile projection/startup avoids unrelated dev-server port",
        harnessHardcoding.status === "pass",
        harnessHardcoding.evidence,
      ),
    ],
  };
}

function ecosystemTrack({
  workspaceRoot,
  projection,
  memoryPersistenceSmoke,
  runtimeIntegrationGate,
  runtimeFullLifecycleGate,
}) {
  const readiness = projection.fragments?.readiness;
  const memoryStack = projection.fragments?.memoryStack;
  return {
    id: "docker-local-ecosystem",
    title: "Docker / Local Ecosystem",
    checks: [
      passFail(
        "Runtime services are projected",
        Array.isArray(projection.services) && projection.services.length >= 6,
        `services=${projection.services?.length ?? 0}`,
      ),
      passFail(
        "Readiness checks cover runtime and presentation",
        Array.isArray(readiness?.checks) &&
          readiness.checks.some((check) => check.name === "daemon:browser-gateway") &&
          readiness.checks.some((check) => check.name === "presentation:web"),
        `checks=${readiness?.checks?.length ?? 0}`,
      ),
      passFail(
        "Compose startup uses wait semantics",
        Array.isArray(readiness?.compose?.args) && readiness.compose.args.includes("--wait"),
        readiness?.compose ? readiness.compose.args.join(" ") : "no compose plan",
      ),
      passFail(
        "Memory stack startup is profile-derived",
        memoryStack?.enabled === true && Array.isArray(memoryStack.services) && memoryStack.services.length >= 5,
        `enabled=${String(memoryStack?.enabled)}, services=${memoryStack?.services?.length ?? 0}`,
      ),
      passFail(
        "Memory retain/reflect unit contract is separate from live persistence",
        memoryUnitContractCovered(workspaceRoot, memoryPersistenceSmoke),
        memoryUnitContractEvidence(memoryPersistenceSmoke),
      ),
      memoryPersistenceLiveGateCheck(memoryPersistenceSmoke),
      runtimeIntegrationGateCheck(runtimeIntegrationGate),
      runtimeFullLifecycleGateCheck(runtimeFullLifecycleGate),
    ],
  };
}

function memoryUnitContractCovered(workspaceRoot, smoke) {
  const tests = smoke?.unitContract?.tests ?? [];
  return tests.length > 0 && tests.every((testPath) => existsSync(join(workspaceRoot, testPath)));
}

function memoryUnitContractEvidence(smoke) {
  const tests = smoke?.unitContract?.tests ?? [];
  return `unit=${tests.join(", ") || "missing"}; command=${smoke?.unitContract?.command?.display ?? "missing"}`;
}

function memoryPersistenceLiveGateCheck(smoke) {
  const gate = smoke?.liveGate;
  const status = gate?.status === "passed" ? "pass" : "warn";
  const evidence = gate?.status === "passed"
    ? `passed=${smoke.gate}; profile=${smoke.profile}`
    : [
        `status=${gate?.status ?? "missing"}`,
        `profile=${smoke?.profile ?? "missing"}`,
        `checks=${(smoke?.checks ?? []).join(",") || "missing"}`,
        `command=node scripts/memory-persistence-smoke.mjs --profile ${smoke?.profile ?? "test-host"} --live`,
      ].join("; ");
  return {
    label: "Memory-store checkpoint + retain/reflect live persistence gate",
    status,
    evidence,
  };
}

function runtimeIntegrationGateCheck(gate) {
  const status =
    gate?.status === "passed"
      ? "pass"
      : gate?.status === "failed"
        ? "fail"
        : "warn";
  return {
    label: "Profile-owned runtime integration gate aggregates child gates",
    status,
    evidence: [
      `gate=${gate?.gate ?? "missing"}`,
      `status=${gate?.status ?? "missing"}`,
      `steps=${(gate?.steps ?? []).map((step) => `${step.id}:${step.status}`).join(",") || "missing"}`,
      `result=${gate?.evidence?.resultPath ?? "missing"}`,
      `childGatesPassed=${String(gate?.evidence?.childGatesPassed ?? false)}`,
    ].join("; "),
  };
}

function runtimeFullLifecycleGateCheck(gate) {
  const status = gate?.status === "pass"
    ? "pass"
    : gate?.status === "fail"
      ? "fail"
      : "warn";
  return {
    label: "Full Docker-backed web/Electron lifecycle gate is evidenced",
    status,
    evidence: gate?.evidence ?? "runtime full lifecycle gate missing",
  };
}

function scoreTrack(track) {
  const summary = track.checks.reduce(
    (counts, item) => {
      counts[item.status] += 1;
      counts.checks += 1;
      return counts;
    },
    { pass: 0, warn: 0, fail: 0, checks: 0 },
  );
  return {
    ...track,
    summary: {
      ...summary,
      score: scoreFromCounts(summary),
    },
  };
}

function scoreFromCounts(summary) {
  if (summary.checks === 0) return 0;
  return Math.round(((summary.pass + summary.warn * 0.5) / summary.checks) * 100);
}

function passFail(label, condition, evidence) {
  return {
    label,
    status: condition ? "pass" : "fail",
    evidence,
  };
}

function warnIf(label, condition, evidence) {
  return {
    label,
    status: condition ? "pass" : "warn",
    evidence,
  };
}

function advisoryWarnIf(label, condition, evidence) {
  return {
    label,
    status: condition ? "pass" : "warn",
    evidence,
    ...(!condition ? { actionable: false } : {}),
  };
}

function hasScripts(packageJson, names) {
  return names.every((name) => typeof packageJson.scripts?.[name] === "string");
}

function readinessTarget(projection, name) {
  return projection.fragments?.readiness?.checks?.find((check) => check.name === name)?.target;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readRequiredValue(argv, index) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

function escapeTableCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

function printHelp() {
  return `Usage: node scripts/upgrade-readiness.mjs [options]

Options:
  --workspace <path>       Kirakira workspace root.
  --profile <name>         Runtime profile to inspect. Defaults to workbench-host.
  --format <json|markdown> Output format. Defaults to markdown.
  --write <path>           Write output to a file instead of stdout.
  --fail-on-issues         Exit non-zero when any check fails.
  --help                   Show this help.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = normalizeUpgradeReadinessArgs(argv);
  if (options.help) {
    process.stdout.write(printHelp());
    return 0;
  }
  const report = buildUpgradeReadinessReport(options);
  const output = renderUpgradeReadinessReport(report, options.format);
  if (options.writePath) {
    writeFileSync(options.writePath, output);
  } else {
    process.stdout.write(output);
  }
  return options.failOnIssues && report.summary.fail > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

function pathToFileUrl(path) {
  return pathToFileURL(resolve(path)).href;
}
