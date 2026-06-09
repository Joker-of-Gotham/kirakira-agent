import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = resolve(SCRIPT_DIR, "..");

const DEFAULT_NAME_ALIASES = {
  eamd: "kirakirad",
};

const DEFAULT_PREFIX_ALIASES = {
  "eam-agent": "kirakira-agent",
};

const PACKAGE_SENTINELS = ["package.json", "tsconfig.json", "src"];
const DOC_SENTINELS = ["README.md"];
const DEFAULT_FILE_EXCLUDES = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

export function normalizeAuditArgs(argv = []) {
  const options = {
    workspaceRoot: DEFAULT_WORKSPACE,
    referenceRoot: join(DEFAULT_WORKSPACE, "reference_project", "eam-agent"),
    format: "markdown",
    depth: "entries",
    sampleSize: 8,
    writePath: undefined,
    failOnMissing: false,
    nameAliases: { ...DEFAULT_NAME_ALIASES },
    prefixAliases: { ...DEFAULT_PREFIX_ALIASES },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--workspace") {
      options.workspaceRoot = resolve(readRequiredValue(argv, index));
      index += 1;
    } else if (arg === "--reference") {
      options.referenceRoot = resolve(readRequiredValue(argv, index));
      index += 1;
    } else if (arg === "--format") {
      const value = readRequiredValue(argv, index);
      if (value !== "json" && value !== "markdown") {
        throw new Error(`Unsupported --format value: ${value}`);
      }
      options.format = value;
      index += 1;
    } else if (arg === "--depth") {
      const value = readRequiredValue(argv, index);
      if (value !== "entries" && value !== "files") {
        throw new Error(`Unsupported --depth value: ${value}`);
      }
      options.depth = value;
      index += 1;
    } else if (arg === "--sample-size") {
      const value = Number(readRequiredValue(argv, index));
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`--sample-size must be a non-negative integer`);
      }
      options.sampleSize = value;
      index += 1;
    } else if (arg === "--write") {
      options.writePath = resolve(readRequiredValue(argv, index));
      index += 1;
    } else if (arg === "--fail-on-missing") {
      options.failOnMissing = true;
    } else if (arg === "--alias") {
      const value = readRequiredValue(argv, index);
      const parsed = parseAlias(value);
      options.nameAliases[parsed.from] = parsed.to;
      index += 1;
    } else if (arg === "--prefix-alias") {
      const value = readRequiredValue(argv, index);
      const parsed = parseAlias(value);
      options.prefixAliases[parsed.from] = parsed.to;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function buildEamParityAudit(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? DEFAULT_WORKSPACE);
  const referenceRoot = resolve(
    options.referenceRoot ?? join(workspaceRoot, "reference_project", "eam-agent"),
  );
  const nameAliases = { ...DEFAULT_NAME_ALIASES, ...(options.nameAliases ?? {}) };
  const prefixAliases = { ...DEFAULT_PREFIX_ALIASES, ...(options.prefixAliases ?? {}) };
  const depth = options.depth ?? "entries";
  const sampleSize = options.sampleSize ?? 8;

  const packages = compareNamedChildren({
    kind: "package",
    sourceRoot: join(referenceRoot, "packages"),
    targetRoot: join(workspaceRoot, "packages"),
    nameAliases,
    sentinels: PACKAGE_SENTINELS,
    depth,
    sampleSize,
  });
  const docs = compareNamedChildren({
    kind: "docs-plane",
    sourceRoot: join(referenceRoot, "docs", "plane"),
    targetRoot: join(workspaceRoot, "docs", "plane"),
    nameAliases: prefixAliases,
    sentinels: DOC_SENTINELS,
    depth,
    sampleSize,
  });

  return {
    generatedAt: new Date().toISOString(),
    depth,
    workspaceRoot,
    referenceRoot,
    summary: summarize([packages, docs]),
    sections: [packages, docs],
  };
}

export function renderEamParityAudit(audit, format = "markdown") {
  if (format === "json") {
    return `${JSON.stringify(audit, null, 2)}\n`;
  }
  const lines = [
    "# EAM Parity Audit",
    "",
    `Generated: ${audit.generatedAt}`,
    `Depth: \`${audit.depth}\``,
    `Reference: \`${toPosixPath(audit.referenceRoot)}\``,
    `Workspace: \`${toPosixPath(audit.workspaceRoot)}\``,
    "",
    "## Summary",
    "",
    `- Exact: ${audit.summary.exact}`,
    `- Equivalent: ${audit.summary.equivalent}`,
    `- Drift: ${audit.summary.drift}`,
    `- Missing: ${audit.summary.missing}`,
    `- Extra: ${audit.summary.extra}`,
    "",
  ];

  for (const section of audit.sections) {
    lines.push(`## ${section.title}`, "");
    lines.push("| Source | Target | Status | Evidence | Files |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of section.rows) {
      lines.push(
        `| \`${row.sourceName ?? "-"}\` | \`${row.targetName ?? "-"}\` | ${row.status} | ${escapeTableCell(row.evidence)} | ${escapeTableCell(fileEvidence(row.fileAudit))} |`,
      );
    }
    if (section.extras.length > 0) {
      lines.push("");
      lines.push("Extra target entries:");
      for (const extra of section.extras) {
        lines.push(`- \`${extra.name}\`: ${extra.evidence}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function compareNamedChildren({
  kind,
  sourceRoot,
  targetRoot,
  nameAliases,
  sentinels,
  depth,
  sampleSize,
}) {
  const sourceEntries = listChildDirectories(sourceRoot);
  const targetEntries = listChildDirectories(targetRoot);
  const targetByName = new Map(targetEntries.map((entry) => [entry.name, entry]));
  const usedTargets = new Set();
  const rows = [];

  for (const source of sourceEntries) {
    const expectedName = mapName(source.name, nameAliases);
    const target = targetByName.get(expectedName);
    if (target) {
      usedTargets.add(target.name);
      const fileAudit =
        depth === "files"
          ? compareFileInventory(source.path, target.path, sampleSize)
          : undefined;
      const hasFileDrift = fileAudit && (fileAudit.missing > 0 || fileAudit.extra > 0);
      const status = hasFileDrift
        ? "drift"
        : expectedName === source.name
          ? "exact"
          : "equivalent";
      rows.push({
        kind,
        sourceName: source.name,
        targetName: target.name,
        status,
        evidence: sentinelEvidence(target.path, sentinels),
        ...(fileAudit ? { fileAudit } : {}),
      });
    } else {
      rows.push({
        kind,
        sourceName: source.name,
        targetName: expectedName,
        status: "missing",
        evidence: `No target directory at ${toPosixPath(relative(dirname(targetRoot), join(targetRoot, expectedName)))}`,
      });
    }
  }

  const extras = targetEntries
    .filter((entry) => !usedTargets.has(entry.name))
    .map((entry) => ({
      name: entry.name,
      evidence: sentinelEvidence(entry.path, sentinels),
    }));

  return {
    kind,
    title: kind === "package" ? "Packages" : "Docs Plane",
    sourceRoot,
    targetRoot,
    rows,
    extras,
  };
}

function summarize(sections) {
  const summary = { exact: 0, equivalent: 0, drift: 0, missing: 0, extra: 0 };
  for (const section of sections) {
    for (const row of section.rows) {
      summary[row.status] += 1;
    }
    summary.extra += section.extras.length;
  }
  return summary;
}

function compareFileInventory(sourceRoot, targetRoot, sampleSize) {
  const sourceFiles = listRelativeFiles(sourceRoot);
  const targetFiles = listRelativeFiles(targetRoot);
  const targetSet = new Set(targetFiles);
  const sourceSet = new Set(sourceFiles);
  const missing = sourceFiles.filter((file) => !targetSet.has(file));
  const extra = targetFiles.filter((file) => !sourceSet.has(file));
  return {
    source: sourceFiles.length,
    target: targetFiles.length,
    matched: sourceFiles.length - missing.length,
    missing: missing.length,
    extra: extra.length,
    missingSamples: missing.slice(0, sampleSize),
    extraSamples: extra.slice(0, sampleSize),
  };
}

function listRelativeFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  visitFiles(root, root, files);
  return files.sort((left, right) => left.localeCompare(right));
}

function visitFiles(root, current, files) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && DEFAULT_FILE_EXCLUDES.has(entry.name)) continue;
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      visitFiles(root, fullPath, files);
    } else if (entry.isFile()) {
      files.push(toPosixPath(relative(root, fullPath)));
    }
  }
}

function listChildDirectories(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: join(root, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function mapName(name, aliases) {
  if (aliases[name]) return aliases[name];
  for (const [from, to] of Object.entries(aliases)) {
    if (name.startsWith(`${from}-`)) {
      return `${to}${name.slice(from.length)}`;
    }
  }
  return name;
}

function sentinelEvidence(root, sentinels) {
  const present = sentinels.filter((sentinel) => existsSync(join(root, sentinel)));
  if (present.length === 0) return "directory present";
  return `present: ${present.join(", ")}`;
}

function readRequiredValue(argv, index) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

function parseAlias(value) {
  const eq = value.indexOf("=");
  if (eq <= 0 || eq === value.length - 1) {
    throw new Error(`Alias must use from=to syntax: ${value}`);
  }
  return {
    from: value.slice(0, eq),
    to: value.slice(eq + 1),
  };
}

function escapeTableCell(value) {
  return value.replaceAll("|", "\\|");
}

function fileEvidence(fileAudit) {
  if (!fileAudit) return "not checked";
  const parts = [
    `${fileAudit.matched}/${fileAudit.source} source files matched`,
    `${fileAudit.missing} missing`,
    `${fileAudit.extra} extra`,
  ];
  if (fileAudit.missingSamples.length > 0) {
    parts.push(`missing: ${fileAudit.missingSamples.join(", ")}`);
  }
  if (fileAudit.extraSamples.length > 0) {
    parts.push(`extra: ${fileAudit.extraSamples.join(", ")}`);
  }
  return parts.join("; ");
}

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

function printHelp() {
  return `Usage: node scripts/eam-parity-audit.mjs [options]

Options:
  --workspace <path>       Target Kirakira workspace root.
  --reference <path>       EAM reference root. Defaults to reference_project/eam-agent.
  --format <json|markdown> Output format. Defaults to markdown.
  --depth <entries|files>  Compare directories only, or include file inventories.
  --sample-size <number>   File drift sample size for each row. Defaults to 8.
  --write <path>           Write output to a file instead of stdout only.
  --fail-on-missing        Exit non-zero when any source package/docs plane is missing.
  --alias <from=to>        Add a package directory alias.
  --prefix-alias <from=to> Add a docs-plane prefix alias.
`;
}

async function main() {
  const options = normalizeAuditArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(printHelp());
    return;
  }

  const audit = buildEamParityAudit(options);
  const output = renderEamParityAudit(audit, options.format);
  if (options.writePath) {
    writeFileSync(options.writePath, output, "utf8");
  }
  process.stdout.write(output);
  if (options.failOnMissing && (audit.summary.missing > 0 || audit.summary.drift > 0)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
