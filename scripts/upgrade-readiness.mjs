import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildEamParityAudit } from "./eam-parity-audit.mjs";
import {
  buildRuntimeProfileProjection,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = resolve(SCRIPT_DIR, "..");
const DEFAULT_PROFILE = "workbench-host";
const FORBIDDEN_PORT_TEXT = "5173";

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
  const parity = buildEamParityAudit({
    workspaceRoot,
    referenceRoot: join(workspaceRoot, "reference_project", "eam-agent"),
    depth: "files",
  });

  const context = { workspaceRoot, packageJson, profile, projection, parity };
  const tracks = [
    eamMechanismTrack(context),
    presentationTrack(context),
    harnessApiTrack(context),
    ecosystemTrack(context),
  ].map(scoreTrack);
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
    },
    tracks,
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
    "",
  ];

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

function eamMechanismTrack({ workspaceRoot, parity }) {
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
      warnIf(
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
    ],
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

function presentationTrack({ workspaceRoot, packageJson, projection }) {
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
        readinessTarget(projection, "presentation:web") === "http://127.0.0.1:5183/",
        `presentation:web=${readinessTarget(projection, "presentation:web") ?? "missing"}`,
      ),
      passFail(
        "Profile owns desktop renderer URL",
        readinessTarget(projection, "presentation:desktop") === "http://127.0.0.1:5174/",
        `presentation:desktop=${readinessTarget(projection, "presentation:desktop") ?? "missing"}`,
      ),
      passFail(
        "Root workbench scripts exist",
        hasScripts(packageJson, ["start:web", "start:desktop", "e2e:workbench"]),
        "start:web, start:desktop, e2e:workbench",
      ),
    ],
  };
}

function harnessApiTrack({ packageJson, projection }) {
  const serializedProjection = JSON.stringify(projection);
  return {
    id: "harness-api-contracts",
    title: "Harness / SDK / API Contracts",
    checks: [
      passFail(
        "Runtime profile and doctor scripts are exposed",
        hasScripts(packageJson, ["runtime:profile", "runtime:doctor"]),
        "package.json scripts runtime:profile/runtime:doctor",
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
        "Projection avoids unrelated dev-server port",
        !serializedProjection.includes(FORBIDDEN_PORT_TEXT),
        "checked profile projection for forbidden dev-server port",
      ),
    ],
  };
}

function ecosystemTrack({ projection }) {
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
    ],
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
