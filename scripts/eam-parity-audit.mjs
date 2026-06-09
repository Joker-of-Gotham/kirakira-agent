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

const DEFAULT_FILE_PATH_RENAME_RULES = [
  {
    kind: "package",
    sourceName: "eamd",
    description: "daemon command package follows the eamd to kirakirad rename",
    replacements: [{ match: "segment", from: "eamd", to: "kirakirad" }],
  },
  {
    kind: "package",
    sourceName: "memory-pipeline",
    description: "Python import root follows the EAM to Kirakira package rename",
    replacements: [
      {
        match: "segment",
        from: "eam_memory_pipeline",
        to: "kirakira_memory_pipeline",
      },
    ],
  },
  {
    kind: "package",
    sourceName: "model-gateway",
    description: "Python import root follows the EAM to Kirakira package rename",
    replacements: [
      {
        match: "segment",
        from: "eam_model_gateway",
        to: "kirakira_model_gateway",
      },
    ],
  },
  {
    kind: "docs-plane",
    sourceName: "eam-agent-tracing",
    description: "tracing docs filenames may carry the product namespace token",
    replacements: [{ match: "basename-prefix", from: "eam-", to: "kirakira-" }],
  },
];

const PACKAGE_SENTINELS = ["package.json", "tsconfig.json", "src"];
const DOC_SENTINELS = ["README.md"];
const DEFAULT_FILE_EXCLUDES = new Set([
  ".git",
  ".kirakira",
  ".turbo",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);
const DEFAULT_FILE_SUFFIX_EXCLUDES = [".pyc", ".pyo"];

export function normalizeAuditArgs(argv = []) {
  const options = {
    workspaceRoot: DEFAULT_WORKSPACE,
    referenceRoot: join(DEFAULT_WORKSPACE, "reference_project", "eam-agent"),
    behaviorPath: undefined,
    behaviorEnabled: true,
    format: "markdown",
    depth: "entries",
    sampleSize: 8,
    writePath: undefined,
    failOnMissing: false,
    nameAliases: { ...DEFAULT_NAME_ALIASES },
    prefixAliases: { ...DEFAULT_PREFIX_ALIASES },
    filePathRenameRules: DEFAULT_FILE_PATH_RENAME_RULES,
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
    } else if (arg === "--behavior") {
      options.behaviorPath = resolve(readRequiredValue(argv, index));
      options.behaviorEnabled = true;
      index += 1;
    } else if (arg === "--no-behavior") {
      options.behaviorEnabled = false;
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
  const filePathRenameRules =
    options.filePathRenameRules ?? DEFAULT_FILE_PATH_RENAME_RULES;
  const depth = options.depth ?? "entries";
  const sampleSize = options.sampleSize ?? 8;
  const behaviorPath =
    options.behaviorEnabled === false
      ? undefined
      : resolve(
          options.behaviorPath ??
            join(workspaceRoot, "docs", "upgrade", "eam-behavior-parity.json"),
        );

  const packages = compareNamedChildren({
    kind: "package",
    sourceRoot: join(referenceRoot, "packages"),
    targetRoot: join(workspaceRoot, "packages"),
    nameAliases,
    sentinels: PACKAGE_SENTINELS,
    depth,
    sampleSize,
    filePathRenameRules,
  });
  const docs = compareNamedChildren({
    kind: "docs-plane",
    sourceRoot: join(referenceRoot, "docs", "plane"),
    targetRoot: join(workspaceRoot, "docs", "plane"),
    nameAliases: prefixAliases,
    sentinels: DOC_SENTINELS,
    depth,
    sampleSize,
    filePathRenameRules,
  });
  const sections = [packages, docs];
  const behaviorParity = behaviorPath
    ? loadBehaviorParity(behaviorPath, sections)
    : undefined;

  const audit = {
    generatedAt: new Date().toISOString(),
    depth,
    workspaceRoot,
    referenceRoot,
    summary: summarize(sections),
    sections: behaviorParity
      ? attachBehaviorChecks(sections, behaviorParity.checks)
      : sections,
  };
  if (behaviorParity) {
    audit.behaviorParity = behaviorParity;
  }
  return audit;
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

  if (audit.behaviorParity) {
    lines.push("## Behavior Parity Checks", "");
    lines.push(
      `Source: \`${toPosixPath(relative(audit.workspaceRoot, audit.behaviorParity.path))}\``,
    );
    lines.push(
      `Coverage: ${audit.behaviorParity.summary.driftRows.checked}/${audit.behaviorParity.summary.driftRows.total} drift rows classified, ${audit.behaviorParity.summary.driftRows.unchecked} unclassified`,
    );
    lines.push(
      `Status: ${formatCountMap(audit.behaviorParity.summary.status)}; Classification: ${formatCountMap(audit.behaviorParity.summary.classification)}`,
    );
    lines.push("");
    if (audit.behaviorParity.nextMechanismGap) {
      const gap = audit.behaviorParity.nextMechanismGap;
      lines.push("### Next Mechanism Gap", "");
      lines.push("| Priority | Target | Status | Gap | Evidence | Commands |");
      lines.push("| --- | --- | --- | --- | --- | --- |");
      lines.push(
        `| ${escapeTableCell(gap.priority)} | \`${gap.targetName}\` | ${gap.status} | ${escapeTableCell(nextGapText(gap))} | ${escapeTableCell(gapEvidence(gap))} | ${escapeTableCell(gap.commands.join("; ") || "none")} |`,
      );
      lines.push("");
    }
    lines.push("| Source | Target | Classification | Behavior status | Evidence | Remaining gaps |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const check of audit.behaviorParity.checks) {
      lines.push(
        `| \`${check.sourceName ?? "-"}\` | \`${check.targetName ?? "-"}\` | ${escapeTableCell(check.classification)} | ${check.status} | ${escapeTableCell(behaviorEvidence(check))} | ${escapeTableCell(check.remainingGaps.join("; ") || "none")} |`,
      );
    }
    lines.push("");

    if (audit.behaviorParity.extraTargetEntries.length > 0) {
      lines.push("Extra target behavior entries:");
      lines.push("");
      lines.push("| Target | Classification | Behavior status | Evidence |");
      lines.push("| --- | --- | --- | --- |");
      for (const entry of audit.behaviorParity.extraTargetEntries) {
        lines.push(
          `| \`${entry.targetName}\` | ${escapeTableCell(entry.classification)} | ${entry.status} | ${escapeTableCell(entry.behavior || "none")} |`,
        );
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function loadBehaviorParity(behaviorPath, sections) {
  if (!existsSync(behaviorPath)) return undefined;
  const payload = JSON.parse(readFileSync(behaviorPath, "utf8"));
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.checks)) {
    throw new Error(`Behavior parity file must contain a checks array: ${behaviorPath}`);
  }
  const checks = payload.checks.map(normalizeBehaviorCheck);
  const extraTargetEntries = Array.isArray(payload.extraTargetEntries)
    ? payload.extraTargetEntries.map(normalizeExtraTargetEntry)
    : [];
  const nextMechanismGap = normalizeNextMechanismGap(payload.nextMechanismGap);
  const driftRows = sections.flatMap((section) =>
    section.rows
      .filter((row) => row.status === "drift")
      .map((row) => behaviorKey(row.kind, row.sourceName, row.targetName)),
  );
  const checkKeys = new Set(
    checks.map((check) => behaviorKey(check.kind, check.sourceName, check.targetName)),
  );
  const checkedDriftRows = driftRows.filter((key) => checkKeys.has(key));
  return {
    path: behaviorPath,
    schemaVersion: payload.schemaVersion ?? 1,
    updatedAt: payload.updatedAt,
    references: Array.isArray(payload.references) ? payload.references : [],
    checks,
    extraTargetEntries,
    ...(nextMechanismGap !== undefined ? { nextMechanismGap } : {}),
    summary: {
      checks: checks.length,
      extraTargetEntries: extraTargetEntries.length,
      status: countBy(checks, "status"),
      classification: countBy(checks, "classification"),
      driftRows: {
        total: driftRows.length,
        checked: checkedDriftRows.length,
        unchecked: driftRows.length - checkedDriftRows.length,
      },
    },
  };
}

function normalizeBehaviorCheck(check) {
  if (!check || typeof check !== "object") {
    throw new Error("Behavior parity checks must be objects");
  }
  if (typeof check.targetName !== "string" || check.targetName.length === 0) {
    throw new Error("Behavior parity checks require a targetName");
  }
  return {
    kind: typeof check.kind === "string" ? check.kind : "package",
    sourceName: typeof check.sourceName === "string" ? check.sourceName : null,
    targetName: check.targetName,
    classification:
      typeof check.classification === "string" ? check.classification : "unclassified",
    status: normalizeBehaviorStatus(check.status),
    behavior: typeof check.behavior === "string" ? check.behavior : "",
    extensionFiles: normalizeStringArray(check.extensionFiles),
    evidence: normalizeEvidence(check.evidence),
    remainingGaps: normalizeStringArray(check.remainingGaps),
    notes: normalizeStringArray(check.notes),
  };
}

function normalizeExtraTargetEntry(entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Extra target behavior entries must be objects");
  }
  if (typeof entry.targetName !== "string" || entry.targetName.length === 0) {
    throw new Error("Extra target behavior entries require a targetName");
  }
  return {
    targetName: entry.targetName,
    classification:
      typeof entry.classification === "string" ? entry.classification : "unclassified",
    status: normalizeBehaviorStatus(entry.status),
    behavior: typeof entry.behavior === "string" ? entry.behavior : "",
  };
}

function normalizeNextMechanismGap(gap) {
  if (gap === undefined) return undefined;
  if (!gap || typeof gap !== "object") {
    throw new Error("nextMechanismGap must be an object when provided");
  }
  if (typeof gap.id !== "string" || gap.id.length === 0) {
    throw new Error("nextMechanismGap requires an id");
  }
  if (typeof gap.targetName !== "string" || gap.targetName.length === 0) {
    throw new Error("nextMechanismGap requires a targetName");
  }
  if (typeof gap.gap !== "string" || gap.gap.length === 0) {
    throw new Error("nextMechanismGap requires a gap");
  }
  return {
    id: gap.id,
    targetName: gap.targetName,
    priority: typeof gap.priority === "string" ? gap.priority : "high",
    status: normalizeBehaviorStatus(gap.status),
    gap: gap.gap,
    rationale: typeof gap.rationale === "string" ? gap.rationale : "",
    evidence: normalizeEvidence(gap.evidence),
    commands: normalizeStringArray(gap.commands),
  };
}

function normalizeBehaviorStatus(status) {
  if (["covered", "partial", "gap", "unknown"].includes(status)) return status;
  return "unknown";
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      kind: typeof item.kind === "string" ? item.kind : "evidence",
      ...(typeof item.path === "string" ? { path: item.path } : {}),
      ...(typeof item.command === "string" ? { command: item.command } : {}),
      ...(typeof item.url === "string" ? { url: item.url } : {}),
      ...(typeof item.note === "string" ? { note: item.note } : {}),
    }));
}

function attachBehaviorChecks(sections, checks) {
  const byKey = new Map(
    checks.map((check) => [
      behaviorKey(check.kind, check.sourceName, check.targetName),
      check,
    ]),
  );
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => {
      const behaviorCheck = byKey.get(
        behaviorKey(row.kind, row.sourceName, row.targetName),
      );
      return behaviorCheck ? { ...row, behaviorCheck } : row;
    }),
  }));
}

function behaviorKey(kind, sourceName, targetName) {
  return `${kind}:${sourceName ?? ""}:${targetName ?? ""}`;
}

function countBy(items, property) {
  return items.reduce((counts, item) => {
    const value = item[property] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCountMap(counts) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `${name}=${count}`)
    .join(", ");
}

function behaviorEvidence(check) {
  const values = [];
  if (check.behavior) values.push(check.behavior);
  for (const item of check.evidence) {
    if (item.path) values.push(`${item.kind}: ${item.path}`);
    else if (item.command) values.push(`${item.kind}: ${item.command}`);
    else if (item.url) values.push(`${item.kind}: ${item.url}`);
    else if (item.note) values.push(`${item.kind}: ${item.note}`);
  }
  return values.join("; ") || "none";
}

function nextGapText(gap) {
  return gap.rationale ? `${gap.gap} ${gap.rationale}` : gap.gap;
}

function gapEvidence(gap) {
  const values = [];
  for (const item of gap.evidence) {
    if (item.path) values.push(`${item.kind}: ${item.path}`);
    else if (item.command) values.push(`${item.kind}: ${item.command}`);
    else if (item.url) values.push(`${item.kind}: ${item.url}`);
    else if (item.note) values.push(`${item.kind}: ${item.note}`);
  }
  return values.join("; ") || "none";
}

function compareNamedChildren({
  kind,
  sourceRoot,
  targetRoot,
  nameAliases,
  sentinels,
  depth,
  sampleSize,
  filePathRenameRules,
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
          ? compareFileInventory(
              source.path,
              target.path,
              sampleSize,
              selectFilePathRenameRules({
                kind,
                sourceName: source.name,
                targetName: target.name,
                rules: filePathRenameRules,
              }),
            )
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

function compareFileInventory(sourceRoot, targetRoot, sampleSize, renameRules = []) {
  const sourceFiles = listRelativeFiles(sourceRoot);
  const targetFiles = listRelativeFiles(targetRoot);
  const sourceRecords = sourceFiles.map((file) => ({
    file,
    normalized: normalizeFilePath(file, renameRules),
  }));
  const targetSet = new Set(targetFiles);
  const normalizedSourceSet = new Set(
    sourceRecords.map((record) => record.normalized),
  );
  const missing = sourceRecords.filter((record) => !targetSet.has(record.normalized));
  const extra = targetFiles.filter((file) => !normalizedSourceSet.has(file));
  const renamed = sourceRecords.filter((record) => record.file !== record.normalized);
  return {
    source: sourceFiles.length,
    target: targetFiles.length,
    matched: sourceRecords.length - missing.length,
    missing: missing.length,
    extra: extra.length,
    renamed: renamed.length,
    pathRules: renameRules.map((rule) => rule.description ?? summarizeRenameRule(rule)),
    missingSamples: missing.slice(0, sampleSize).map(formatFileRecord),
    extraSamples: extra.slice(0, sampleSize),
  };
}

function selectFilePathRenameRules({ kind, sourceName, targetName, rules }) {
  return rules.filter((rule) => {
    if (rule.kind && rule.kind !== kind) return false;
    if (rule.sourceName && !matchesRuleValue(rule.sourceName, sourceName)) return false;
    if (rule.targetName && !matchesRuleValue(rule.targetName, targetName)) return false;
    return true;
  });
}

function matchesRuleValue(ruleValue, value) {
  if (Array.isArray(ruleValue)) return ruleValue.includes(value);
  return ruleValue === value;
}

function normalizeFilePath(file, rules) {
  return rules.reduce((current, rule) => {
    return (rule.replacements ?? []).reduce(applyPathReplacement, current);
  }, file);
}

function applyPathReplacement(file, replacement) {
  if (!replacement?.from || replacement.to === undefined) return file;
  if (replacement.match === "segment") {
    return file
      .split("/")
      .map((segment) => (segment === replacement.from ? replacement.to : segment))
      .join("/");
  }
  if (replacement.match === "prefix") {
    return file.startsWith(replacement.from)
      ? `${replacement.to}${file.slice(replacement.from.length)}`
      : file;
  }
  if (replacement.match === "basename-prefix") {
    const segments = file.split("/");
    const basename = segments.at(-1);
    if (!basename?.startsWith(replacement.from)) return file;
    segments[segments.length - 1] =
      `${replacement.to}${basename.slice(replacement.from.length)}`;
    return segments.join("/");
  }
  if (replacement.match === "substring") {
    return file.replaceAll(replacement.from, replacement.to);
  }
  throw new Error(`Unsupported file path replacement match: ${replacement.match}`);
}

function summarizeRenameRule(rule) {
  return (rule.replacements ?? [])
    .map((replacement) => `${replacement.match}:${replacement.from}->${replacement.to}`)
    .join(", ");
}

function formatFileRecord(record) {
  return record.file === record.normalized
    ? record.file
    : `${record.file} -> ${record.normalized}`;
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
    } else if (entry.isFile() && !shouldExcludeFile(entry.name)) {
      files.push(toPosixPath(relative(root, fullPath)));
    }
  }
}

function shouldExcludeFile(name) {
  return DEFAULT_FILE_SUFFIX_EXCLUDES.some((suffix) => name.endsWith(suffix));
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
  if (fileAudit.renamed > 0) {
    parts.push(`${fileAudit.renamed} source paths normalized`);
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
  --behavior <path>        Behavior parity JSON to merge into file drift rows.
  --no-behavior            Disable default docs/upgrade behavior parity merge.
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
