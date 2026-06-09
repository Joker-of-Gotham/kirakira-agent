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

export function normalizeAuditArgs(argv = []) {
  const options = {
    workspaceRoot: DEFAULT_WORKSPACE,
    referenceRoot: join(DEFAULT_WORKSPACE, "reference_project", "eam-agent"),
    format: "markdown",
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

  const packages = compareNamedChildren({
    kind: "package",
    sourceRoot: join(referenceRoot, "packages"),
    targetRoot: join(workspaceRoot, "packages"),
    nameAliases,
    sentinels: PACKAGE_SENTINELS,
  });
  const docs = compareNamedChildren({
    kind: "docs-plane",
    sourceRoot: join(referenceRoot, "docs", "plane"),
    targetRoot: join(workspaceRoot, "docs", "plane"),
    nameAliases: prefixAliases,
    sentinels: DOC_SENTINELS,
  });

  return {
    generatedAt: new Date().toISOString(),
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
    `Reference: \`${toPosixPath(audit.referenceRoot)}\``,
    `Workspace: \`${toPosixPath(audit.workspaceRoot)}\``,
    "",
    "## Summary",
    "",
    `- Exact: ${audit.summary.exact}`,
    `- Equivalent: ${audit.summary.equivalent}`,
    `- Missing: ${audit.summary.missing}`,
    `- Extra: ${audit.summary.extra}`,
    "",
  ];

  for (const section of audit.sections) {
    lines.push(`## ${section.title}`, "");
    lines.push("| Source | Target | Status | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of section.rows) {
      lines.push(
        `| \`${row.sourceName ?? "-"}\` | \`${row.targetName ?? "-"}\` | ${row.status} | ${escapeTableCell(row.evidence)} |`,
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

function compareNamedChildren({ kind, sourceRoot, targetRoot, nameAliases, sentinels }) {
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
      const status = expectedName === source.name ? "exact" : "equivalent";
      rows.push({
        kind,
        sourceName: source.name,
        targetName: target.name,
        status,
        evidence: sentinelEvidence(target.path, sentinels),
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
  const summary = { exact: 0, equivalent: 0, missing: 0, extra: 0 };
  for (const section of sections) {
    for (const row of section.rows) {
      summary[row.status] += 1;
    }
    summary.extra += section.extras.length;
  }
  return summary;
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

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

function printHelp() {
  return `Usage: node scripts/eam-parity-audit.mjs [options]

Options:
  --workspace <path>       Target Kirakira workspace root.
  --reference <path>       EAM reference root. Defaults to reference_project/eam-agent.
  --format <json|markdown> Output format. Defaults to markdown.
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
  if (options.failOnMissing && audit.summary.missing > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
