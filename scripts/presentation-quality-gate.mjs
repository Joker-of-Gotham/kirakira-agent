#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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
const FORBIDDEN_DEV_PORT = "5173";

const REQUIRED_STYLE_TOKENS = Object.freeze([
  "--kk-color-canvas",
  "--kk-color-surface",
  "--kk-color-accent",
  "--kk-space-1",
  "--kk-radius-md",
]);

const REQUIRED_SMOKE_SELECTORS = Object.freeze([
  "main.kk-shell",
  '[aria-label="Run navigation"]',
  '[aria-label="Runtime workspace"]',
]);

const REQUIRED_SMOKE_TEXT = Object.freeze([
  "Kirakira Agent",
  "Desktop IPC",
  "Runtime workbench",
]);

const REPORT_FORMATS = new Set(["markdown", "json"]);

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

export function normalizePresentationQualityGateArgs(argv = []) {
  const options = {
    profileName: DEFAULT_PROFILE,
    format: "markdown",
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
  const profilesPath = join(workspaceRoot, "configs", "runtime", "profiles.json");
  const config = loadRuntimeProfiles(profilesPath);
  const profile = resolveRuntimeProfile(profileName, config, env);
  const readiness = buildRuntimeReadinessPlan(profile, { config });
  const webTarget = readinessTarget(readiness, "presentation:web");
  const desktopTarget = readinessTarget(readiness, "presentation:desktop");

  const sources = {
    styles: readWorkspaceText(workspaceRoot, "packages/frontend-app/src/styles.css"),
    workbench: readWorkspaceText(workspaceRoot, "packages/frontend-app/src/workbench.tsx"),
    details: readWorkspaceText(workspaceRoot, "packages/frontend-core/src/workbench-details.ts"),
    manifest: readWorkspaceText(workspaceRoot, "apps/desktop/src/main/startup-manifest.ts"),
    smoke: readWorkspaceText(workspaceRoot, "apps/desktop/src/main/electron-smoke.ts"),
    contract: readWorkspaceText(workspaceRoot, "docs/design/desktop-web-presentation-contract.md"),
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
        ]),
      "anchors=kk-shell, Run navigation, Runtime workspace",
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

  const forbiddenProbe = JSON.stringify({
    readiness,
    checks,
    sourceEvidence: Object.fromEntries(
      Object.entries(sources).map(([key, source]) => [key, source.relativePath]),
    ),
  });
  checks.push(checkResult(
    "no-forbidden-dev-port",
    "presentation plan avoids the unrelated 5173 dev-server port",
    !forbiddenProbe.includes(FORBIDDEN_DEV_PORT),
    `forbidden=${FORBIDDEN_DEV_PORT}`,
  ));

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
    summary: {
      status: failed.length === 0 ? "pass" : "fail",
      passed: checks.length - failed.length,
      failed: failed.length,
      total: checks.length,
    },
    checks,
  };
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
    "",
    "| Check | Status | Evidence |",
    "| --- | --- | --- |",
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.label} | ${check.status} | ${check.evidence} |`);
  }
  return `${lines.join("\n")}\n`;
}

function usage() {
  return `Usage: node scripts/presentation-quality-gate.mjs [--profile workbench-host] [--format markdown|json] [--fail-on-issues]\n`;
}

async function main(argv) {
  const options = normalizePresentationQualityGateArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const report = buildPresentationQualityReport({ profileName: options.profileName });
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
