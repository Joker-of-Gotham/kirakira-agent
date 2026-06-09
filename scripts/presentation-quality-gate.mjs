#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
  runtimeReadinessCheckMap,
} from "./runtime-profile.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_PROFILE = "workbench-host";

const REQUIRED_STYLE_TOKENS = Object.freeze([
  "--kk-color-canvas",
  "--kk-color-surface",
  "--kk-color-accent",
  "--kk-space-1",
  "--kk-radius-md",
]);

const REQUIRED_SMOKE_SELECTORS = Object.freeze([
  "main.kk-shell",
  '[data-kk-presentation-surface="desktop"]',
  '[aria-label="Run navigation"]',
  '[aria-label="Runtime workspace"]',
]);

const REQUIRED_SMOKE_TEXT = Object.freeze([
  "Kirakira Agent",
  "Desktop IPC",
  "Runs Workbench",
  "Recent Runs",
]);

const REPORT_FORMATS = new Set(["markdown", "json"]);
const MIN_NAVIGATION_VIEW_COUNT = 4;
const MIN_INSPECTOR_TAB_COUNT = 4;
const MIN_DETAIL_METRIC_COUNT = 9;
const MIN_INSPECTOR_METRIC_COUNT = 12;
const VISUAL_REVIEW_VIEWPORTS = Object.freeze([
  { id: "mobile", width: 375, height: 812, surface: "narrow web and desktop renderer" },
  { id: "tablet", width: 768, height: 1024, surface: "single-column workbench transition" },
  { id: "desktop", width: 1440, height: 900, surface: "three-pane workbench" },
]);

function isMainModule() {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
    : false;
}

function readWorkspaceText(workspaceRoot, relativePath) {
  const absolutePath = join(workspaceRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return { relativePath, absolutePath, text: "", missing: true };
  }
  return {
    relativePath,
    absolutePath,
    text: readFileSync(absolutePath, "utf8"),
    missing: false,
  };
}

function sourceHasAll(source, values) {
  return values.every((value) => source.includes(value));
}

function extractStringUnion(source, typeName) {
  const match = new RegExp(`export type ${typeName}\\s*=\\s*([^;]+);`, "u").exec(source);
  return match?.[1]
    ?.match(/"([^"]+)"/gu)
    ?.map((value) => value.replaceAll('"', ""))
    ?? [];
}

function extractMetricLabels(source) {
  return [...source.matchAll(/metric\("([^"]+)"/gu)].map((match) => match[1]);
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

function reviewDimension(id, label, passed, evidence) {
  return {
    id,
    label,
    status: passed ? "pass" : "review",
    severity: passed ? "none" : "medium",
    evidence,
  };
}

function buildDesignReview(sources, iaDensity) {
  const styles = sources.styles.text;
  const workbench = sources.workbench.text;
  const sourceSignals = {
    responsiveBreakpoints: countMatches(styles, /@media\s*\(/gu),
    focusVisibleRules: countMatches(styles, /:focus-visible/gu),
    tokenReferences: countMatches(styles, /var\(--kk-/gu),
    colorTokenDefinitions: countMatches(styles, /--kk-color-/gu),
    spacingTokenDefinitions: countMatches(styles, /--kk-space-/gu),
    radiusTokenDefinitions: countMatches(styles, /--kk-radius-/gu),
    shadowReferences: countMatches(styles, /--kk-shadow/gu),
    fontFamilyRules: countMatches(styles, /font-family:/gu),
    lineHeightRules: countMatches(styles, /line-height:/gu),
    letterSpacingRules: countMatches(styles, /letter-spacing:\s*0/gu),
    overflowGuards: countMatches(styles, /overflow-wrap|text-overflow|minmax\(0/gu),
    motionPreferenceRules: countMatches(styles, /prefers-reduced-motion/gu),
    ariaLabels: countMatches(workbench, /aria-label=/gu),
    liveRegions: countMatches(workbench, /aria-live=|role="status"/gu),
    alertRegions: countMatches(workbench, /role="alert"/gu),
    disabledControls: countMatches(workbench, /disabled=/gu),
    emptyStates: countMatches(workbench, /kk-empty/gu),
  };
  const scorecard = [
    reviewDimension(
      "layout",
      "Layout",
      sourceSignals.responsiveBreakpoints >= 3
        && iaDensity.navigationViews.length >= MIN_NAVIGATION_VIEW_COUNT
        && iaDensity.inspectorTabs.length >= MIN_INSPECTOR_TAB_COUNT,
      `breakpoints=${sourceSignals.responsiveBreakpoints}; nav=${iaDensity.navigationViews.length}; inspector=${iaDensity.inspectorTabs.length}`,
    ),
    reviewDimension(
      "typography",
      "Typography",
      sourceSignals.fontFamilyRules > 0
        && sourceSignals.lineHeightRules >= 8
        && sourceSignals.letterSpacingRules >= 3,
      `fontFamily=${sourceSignals.fontFamilyRules}; lineHeight=${sourceSignals.lineHeightRules}; letterSpacingZero=${sourceSignals.letterSpacingRules}`,
    ),
    reviewDimension(
      "spacing",
      "Spacing",
      sourceSignals.spacingTokenDefinitions >= 5 && sourceSignals.tokenReferences >= 100,
      `spaceTokens=${sourceSignals.spacingTokenDefinitions}; tokenRefs=${sourceSignals.tokenReferences}`,
    ),
    reviewDimension(
      "color",
      "Color",
      sourceSignals.colorTokenDefinitions >= 16 && sourceSignals.tokenReferences >= 100,
      `colorTokens=${sourceSignals.colorTokenDefinitions}; tokenRefs=${sourceSignals.tokenReferences}`,
    ),
    reviewDimension(
      "hierarchy",
      "Hierarchy",
      iaDensity.rendererEntrypoints.length === 3
        && iaDensity.detailMetricLabels.length >= MIN_DETAIL_METRIC_COUNT
        && iaDensity.inspectorMetricLabels.length >= MIN_INSPECTOR_METRIC_COUNT,
      `entrypoints=${iaDensity.rendererEntrypoints.length}; detailMetrics=${iaDensity.detailMetricLabels.length}; inspectorMetrics=${iaDensity.inspectorMetricLabels.length}`,
    ),
    reviewDimension(
      "consistency",
      "Consistency",
      sourceSignals.radiusTokenDefinitions >= 3
        && sourceSignals.shadowReferences >= 2
        && sourceSignals.ariaLabels >= 30,
      `radiusTokens=${sourceSignals.radiusTokenDefinitions}; shadows=${sourceSignals.shadowReferences}; ariaLabels=${sourceSignals.ariaLabels}`,
    ),
    reviewDimension(
      "interaction-responsive",
      "Interaction and Responsive",
      sourceSignals.focusVisibleRules >= 3
        && sourceSignals.liveRegions >= 3
        && sourceSignals.emptyStates >= 12
        && sourceSignals.motionPreferenceRules >= 1
        && sourceSignals.overflowGuards >= 20,
      `focus=${sourceSignals.focusVisibleRules}; live=${sourceSignals.liveRegions}; empty=${sourceSignals.emptyStates}; overflow=${sourceSignals.overflowGuards}; motion=${sourceSignals.motionPreferenceRules}`,
    ),
  ];
  const passed = scorecard.filter((dimension) => dimension.status === "pass").length;
  return {
    method: "browser-safe source review",
    viewports: VISUAL_REVIEW_VIEWPORTS,
    sourceSignals,
    scorecard,
    summary: {
      status: passed === scorecard.length ? "pass" : "review",
      passed,
      total: scorecard.length,
    },
    followUp: "Capture screenshots for the same viewport targets once renderer screenshot automation is available.",
  };
}

function readinessTarget(readiness, checkName) {
  const check = runtimeReadinessCheckMap(readiness).get(checkName);
  return typeof check?.target === "string" ? check.target : undefined;
}

function checkResult(id, label, passed, evidence) {
  return {
    id,
    label,
    status: passed ? "pass" : "fail",
    evidence,
  };
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function resolveArtifactPath(workspaceRoot, artifactPath) {
  return artifactPath === undefined ? undefined : resolve(workspaceRoot, artifactPath);
}

export function normalizePresentationQualityGateArgs(argv = []) {
  const options = {
    profileName: DEFAULT_PROFILE,
    format: "markdown",
    artifactPath: undefined,
    failOnIssues: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--profile":
        options.profileName = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--format":
        options.format = requireValue(argv, index, arg);
        if (!REPORT_FORMATS.has(options.format)) {
          throw new Error(`Unsupported format "${options.format}". Use markdown or json.`);
        }
        index += 1;
        break;
      case "--artifact":
        options.artifactPath = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--fail-on-issues":
        options.failOnIssues = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function buildPresentationQualityReport(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT);
  const profileName = options.profileName ?? DEFAULT_PROFILE;
  const env = options.env ?? process.env;
  const artifactPath = resolveArtifactPath(workspaceRoot, options.artifactPath);
  const profilesPath = join(workspaceRoot, "configs", "runtime", "profiles.json");
  const config = loadRuntimeProfiles(profilesPath);
  const profile = resolveRuntimeProfile(profileName, config, env);
  const readiness = buildRuntimeReadinessPlan(profile, { config });
  const webTarget = readinessTarget(readiness, "presentation:web");
  const desktopTarget = readinessTarget(readiness, "presentation:desktop");

  const sources = {
    styles: readWorkspaceText(workspaceRoot, "packages/frontend-app/src/styles.css"),
    workbench: readWorkspaceText(workspaceRoot, "packages/frontend-app/src/workbench.tsx"),
    navigation: readWorkspaceText(workspaceRoot, "packages/frontend-core/src/workbench-navigation.ts"),
    inspector: readWorkspaceText(workspaceRoot, "packages/frontend-core/src/workbench-inspector.ts"),
    details: readWorkspaceText(workspaceRoot, "packages/frontend-core/src/workbench-details.ts"),
    webEntrypoint: readWorkspaceText(workspaceRoot, "apps/web/src/main.tsx"),
    desktopRenderer: readWorkspaceText(workspaceRoot, "apps/desktop/src/renderer/main.tsx"),
    manifest: readWorkspaceText(workspaceRoot, "apps/desktop/src/main/startup-manifest.ts"),
    smoke: readWorkspaceText(workspaceRoot, "apps/desktop/src/main/electron-smoke.ts"),
    contract: readWorkspaceText(workspaceRoot, "docs/design/desktop-web-presentation-contract.md"),
  };
  const iaDensity = {
    navigationViews: extractStringUnion(sources.navigation.text, "WorkbenchViewId"),
    inspectorTabs: extractStringUnion(sources.inspector.text, "WorkbenchInspectorViewId"),
    detailMetricLabels: extractMetricLabels(sources.details.text),
    inspectorMetricLabels: extractMetricLabels(sources.inspector.text),
    rendererEntrypoints: [
      "createWorkbenchNavigationView",
      "createWorkbenchInspectorView",
      "createWorkbenchDetailViews",
    ].filter((entrypoint) => sources.workbench.text.includes(entrypoint)),
  };
  const designReview = buildDesignReview(sources, iaDensity);
  const surfaceIdentity = {
    attribute: "data-kk-presentation-surface",
    surfaces: ["web", "desktop"],
    web: {
      entrypoint: sources.webEntrypoint.relativePath,
      declared: sources.webEntrypoint.text.includes('presentationSurface="web"'),
    },
    desktop: {
      entrypoint: sources.desktopRenderer.relativePath,
      declared: sources.desktopRenderer.text.includes('presentationSurface="desktop"'),
    },
    sharedWorkbenchAttribute: sources.workbench.text.includes("data-kk-presentation-surface"),
  };

  const checks = [
    checkResult(
      "profile-web-target",
      "runtime profile declares the web presentation readiness target",
      Boolean(webTarget) && webTarget !== desktopTarget,
      `presentation:web=${webTarget ?? "missing"}`,
    ),
    checkResult(
      "profile-desktop-target",
      "runtime profile declares the desktop renderer readiness target",
      Boolean(desktopTarget) && desktopTarget !== webTarget,
      `presentation:desktop=${desktopTarget ?? "missing"}`,
    ),
    checkResult(
      "shared-design-tokens",
      "shared workbench styles expose the presentation design tokens",
      !sources.styles.missing
        && sourceHasAll(sources.styles.text, REQUIRED_STYLE_TOKENS)
        && sources.styles.text.includes(":focus-visible"),
      `tokens=${REQUIRED_STYLE_TOKENS.join(", ")}; focus-visible=${sources.styles.text.includes(":focus-visible")}`,
    ),
    checkResult(
      "workbench-a11y-anchors",
      "shared workbench exposes stable shell and accessibility anchors",
      !sources.workbench.missing
        && sourceHasAll(sources.workbench.text, [
          "kk-shell",
          'aria-label="Run navigation"',
          'aria-label="Runtime workspace"',
          "data-kk-presentation-surface",
        ]),
      "anchors=kk-shell, Run navigation, Runtime workspace, presentation surface",
    ),
    checkResult(
      "presentation-surface-identity",
      "web and desktop renderer entrypoints declare distinct shared workbench surfaces",
      !sources.webEntrypoint.missing
        && !sources.desktopRenderer.missing
        && surfaceIdentity.sharedWorkbenchAttribute
        && surfaceIdentity.web.declared
        && surfaceIdentity.desktop.declared,
      `surfaces=${surfaceIdentity.surfaces.join(",")}; attr=${surfaceIdentity.attribute}`,
    ),
    checkResult(
      "desktop-smoke-content-contract",
      "Electron smoke contract asserts shared renderer content",
      !sources.manifest.missing
        && !sources.smoke.missing
        && sourceHasAll(sources.manifest.text, REQUIRED_SMOKE_SELECTORS)
        && sourceHasAll(sources.manifest.text, REQUIRED_SMOKE_TEXT)
        && sourceHasAll(sources.smoke.text, [
          "electronSmokeRendererProbeFailures",
          "rootChildCount",
          "bridgeApiMethods",
        ]),
      `selectors=${REQUIRED_SMOKE_SELECTORS.length}; text=${REQUIRED_SMOKE_TEXT.length}`,
    ),
    checkResult(
      "multi-view-ia-density",
      "shared renderer exposes dense multi-view navigation, inspector, and detail surfaces",
      !sources.navigation.missing
        && !sources.inspector.missing
        && !sources.details.missing
        && !sources.workbench.missing
        && iaDensity.navigationViews.length >= MIN_NAVIGATION_VIEW_COUNT
        && iaDensity.inspectorTabs.length >= MIN_INSPECTOR_TAB_COUNT
        && iaDensity.detailMetricLabels.length >= MIN_DETAIL_METRIC_COUNT
        && iaDensity.inspectorMetricLabels.length >= MIN_INSPECTOR_METRIC_COUNT
        && iaDensity.rendererEntrypoints.length === 3,
      `nav=${iaDensity.navigationViews.length}; inspector=${iaDensity.inspectorTabs.length}; detailMetrics=${iaDensity.detailMetricLabels.length}; inspectorMetrics=${iaDensity.inspectorMetricLabels.length}`,
    ),
    checkResult(
      "visual-design-review-artifact",
      "QA artifact includes a browser-safe seven-dimension visual review scorecard",
      designReview.viewports.length === VISUAL_REVIEW_VIEWPORTS.length
        && designReview.scorecard.length === 7
        && designReview.summary.status === "pass",
      `dimensions=${designReview.summary.passed}/${designReview.summary.total}; viewports=${designReview.viewports.map((viewport) => viewport.id).join(",")}`,
    ),
    checkResult(
      "visual-qa-hooks",
      "artifact visual-QA evidence is surfaced in shared web and desktop views",
      !sources.workbench.missing
        && !sources.details.missing
        && sourceHasAll(sources.workbench.text, [
          "kk-qa-hook-strip",
          "Visual QA labels",
          "visualQa",
        ])
        && sourceHasAll(sources.details.text, [
          "WorkbenchVisualQaHooks",
          "visualQaHooks",
          "visual qa",
        ]),
      "hooks=artifact cards, subagent drawer, visual QA labels",
    ),
    checkResult(
      "presentation-contract-doc",
      "presentation contract documents the OpenHuman reference boundary and QA entry points",
      !sources.contract.missing
        && sourceHasAll(sources.contract.text, [
          "OpenHuman",
          "Electron Boundary",
          "QA Entry Points",
        ]),
      "doc=docs/design/desktop-web-presentation-contract.md",
    ),
  ];

  const failed = checks.filter((check) => check.status === "fail");
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    profile: profile.name,
    readiness: {
      webTarget,
      desktopTarget,
      checkNames: readiness.checks.map((check) => check.name),
    },
    iaDensity,
    designReview,
    surfaceIdentity,
    artifacts: {
      ...(artifactPath ? { reportPath: artifactPath } : {}),
    },
    summary: {
      status: failed.length === 0 ? "pass" : "fail",
      passed: checks.length - failed.length,
      failed: failed.length,
      total: checks.length,
    },
    checks,
  };
}

export function writePresentationQualityArtifact(report, artifactPath = report.artifacts?.reportPath) {
  if (!artifactPath) {
    throw new Error("Presentation quality artifact path is required");
  }
  const outputPath = resolve(report.workspaceRoot, artifactPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderPresentationQualityReport({
    ...report,
    artifacts: {
      ...report.artifacts,
      reportPath: outputPath,
    },
  }, "json"));
  return outputPath;
}

export function renderPresentationQualityReport(report, format = "markdown") {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "# Kirakira Presentation Quality Gate",
    "",
    `Profile: ${report.profile}`,
    `Status: ${report.summary.status} (${report.summary.passed}/${report.summary.total} checks passed)`,
    `Web target: ${report.readiness.webTarget ?? "missing"}`,
    `Desktop target: ${report.readiness.desktopTarget ?? "missing"}`,
    ...(report.artifacts?.reportPath ? [`Artifact: ${report.artifacts.reportPath}`] : []),
    `Surfaces: ${report.surfaceIdentity.surfaces.join(", ")} (${report.surfaceIdentity.attribute})`,
    `IA density: ${report.iaDensity.navigationViews.length} nav views, ${report.iaDensity.inspectorTabs.length} inspector tabs`,
    `Visual review: ${report.designReview.summary.status} (${report.designReview.summary.passed}/${report.designReview.summary.total} dimensions passed)`,
    "",
    "| Check | Status | Evidence |",
    "| --- | --- | --- |",
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.label} | ${check.status} | ${check.evidence} |`);
  }
  lines.push("", "| Visual Dimension | Status | Evidence |", "| --- | --- | --- |");
  for (const dimension of report.designReview.scorecard) {
    lines.push(`| ${dimension.label} | ${dimension.status} | ${dimension.evidence} |`);
  }
  return `${lines.join("\n")}\n`;
}

function usage() {
  return `Usage: node scripts/presentation-quality-gate.mjs [--profile workbench-host] [--format markdown|json] [--artifact tmp/presentation-quality/workbench-host.json] [--fail-on-issues]\n`;
}

async function main(argv) {
  const options = normalizePresentationQualityGateArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const report = buildPresentationQualityReport({
    profileName: options.profileName,
    artifactPath: options.artifactPath,
  });
  if (options.artifactPath) {
    writePresentationQualityArtifact(report, options.artifactPath);
  }
  process.stdout.write(renderPresentationQualityReport(report, options.format));
  if (options.failOnIssues && report.summary.status !== "pass") {
    process.exitCode = 1;
  }
}

if (isMainModule()) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
