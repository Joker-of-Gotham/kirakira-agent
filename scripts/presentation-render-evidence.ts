#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildPresentationRenderEvidence } from "../packages/frontend-app/src/presentation-render-evidence.js";
import {
  buildRuntimeProfileProjection,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const DEFAULT_WORKSPACE = resolve(import.meta.dirname, "..");
const DEFAULT_PROFILE = "workbench-host";
const DEFAULT_RESULT_PATH = "docs/upgrade/gates/presentation-render-evidence.json";

export interface PresentationRenderEvidenceCliOptions {
  workspaceRoot: string;
  profileName: string;
  writeResultPath?: string;
  noWriteResult: boolean;
  format: "json" | "markdown";
  help: boolean;
}

export function normalizePresentationRenderEvidenceArgs(
  argv: string[] = [],
): PresentationRenderEvidenceCliOptions {
  const options: PresentationRenderEvidenceCliOptions = {
    workspaceRoot: DEFAULT_WORKSPACE,
    profileName: DEFAULT_PROFILE,
    writeResultPath: resolve(DEFAULT_WORKSPACE, DEFAULT_RESULT_PATH),
    noWriteResult: false,
    format: "json",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--workspace") {
      options.workspaceRoot = resolve(readRequiredValue(argv, index));
      options.writeResultPath = resolve(options.workspaceRoot, DEFAULT_RESULT_PATH);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      options.profileName = readRequiredValue(argv, index);
      index += 1;
      continue;
    }
    if (arg === "--write-result") {
      options.writeResultPath = resolve(readRequiredValue(argv, index));
      options.noWriteResult = false;
      index += 1;
      continue;
    }
    if (arg === "--no-write-result") {
      options.noWriteResult = true;
      continue;
    }
    if (arg === "--format") {
      const value = readRequiredValue(argv, index);
      if (value !== "json" && value !== "markdown") {
        throw new Error(`Unsupported --format value: ${value}`);
      }
      options.format = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function buildPresentationRenderEvidenceReport(
  options: Partial<PresentationRenderEvidenceCliOptions> = {},
  env: NodeJS.ProcessEnv = process.env,
) {
  const workspaceRoot = resolve(options.workspaceRoot ?? DEFAULT_WORKSPACE);
  const profileName = options.profileName ?? DEFAULT_PROFILE;
  const config = loadRuntimeProfiles(join(workspaceRoot, "configs", "runtime", "profiles.json"));
  const profile = resolveRuntimeProfile(profileName, config, env);
  const projection = buildRuntimeProfileProjection(profile, { config });
  return {
    ...buildPresentationRenderEvidence({
      profile: projection.profile,
      command: buildCommandLabel(options),
    }),
    targets: buildPresentationTargets(projection),
  };
}

export function writePresentationRenderEvidenceArtifact(
  report: ReturnType<typeof buildPresentationRenderEvidenceReport>,
  resultPath: string,
): string {
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return resultPath;
}

export function readPresentationRenderEvidenceArtifact(resultPath: string) {
  if (!existsSync(resultPath)) return undefined;
  return JSON.parse(readFileSync(resultPath, "utf8"));
}

export function renderPresentationRenderEvidenceReport(
  report: ReturnType<typeof buildPresentationRenderEvidenceReport>,
  format: "json" | "markdown" = "json",
): string {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  const lines = [
    "# Kirakira Presentation Render Evidence",
    "",
    `Status: ${report.status}`,
    `Profile: ${report.profile}`,
    `Summary: ${report.summary.passed}/${report.summary.total} checks passed`,
    "",
    "| Surface | Transport | Environment | Bytes | SHA-256 | Failures |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...report.surfaces.map((surface) =>
      [
        surface.surface,
        surface.transportMode,
        surface.environmentLabel,
        String(surface.html.bytes),
        surface.html.sha256,
        surface.failures.join(", ") || "none",
      ].join(" | "),
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = normalizePresentationRenderEvidenceArgs(argv);
  if (options.help) {
    console.log(printHelp());
    return 0;
  }
  const report = buildPresentationRenderEvidenceReport(options);
  if (!options.noWriteResult && options.writeResultPath) {
    writePresentationRenderEvidenceArtifact(report, options.writeResultPath);
  }
  console.log(renderPresentationRenderEvidenceReport(report, options.format));
  return report.status === "passed" ? 0 : 1;
}

function buildPresentationTargets(projection: ReturnType<typeof buildRuntimeProfileProjection>) {
  return [
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
    const readinessTarget = projection.fragments?.readiness?.checks?.find(
      (check) => check.name === target.readinessName,
    )?.target;
    const envTarget = projection.fragments?.env?.values?.[target.envName];
    return {
      ...target,
      readinessTarget: readinessTarget ?? null,
      envTarget: envTarget ?? null,
      status:
        readinessTarget && envTarget && normalizedUrl(readinessTarget) === normalizedUrl(envTarget)
          ? "pass"
          : "fail",
    };
  });
}

function normalizedUrl(value: string): string {
  return String(value).replace(/\/+$/u, "");
}

function buildCommandLabel(options: Partial<PresentationRenderEvidenceCliOptions>): string {
  const args = ["--tsconfig", "tsconfig.base.json", "scripts/presentation-render-evidence.ts"];
  if (options.profileName) args.push("--profile", options.profileName);
  if (options.writeResultPath) args.push("--write-result", options.writeResultPath);
  if (options.noWriteResult) args.push("--no-write-result");
  return `tsx ${args.join(" ")}`;
}

function readRequiredValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

function printHelp(): string {
  return `Usage: pnpm presentation:render [options]

Options:
  --workspace <path>        Kirakira workspace root.
  --profile <name>          Runtime profile to inspect. Defaults to workbench-host.
  --write-result <path>     Write JSON result artifact.
  --no-write-result         Do not write the JSON result artifact.
  --format <json|markdown>  Output format. Defaults to json.
  --help                    Show this help.
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
