import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildEamParityAudit,
  normalizeAuditArgs,
  renderEamParityAudit,
} from "../../../scripts/eam-parity-audit.mjs";

describe("EAM parity audit", () => {
  it("maps equivalent package and docs-plane names without hardcoded roots", () => {
    const root = mkdtempSync(join(tmpdir(), "kirakira-parity-"));
    const reference = join(root, "reference");
    const workspace = join(root, "workspace");

    createPackage(reference, "agent-runtime");
    createPackage(reference, "eamd");
    createPackage(workspace, "agent-runtime");
    createPackage(workspace, "kirakirad");
    createDocsPlane(reference, "eam-agent-memory");
    createDocsPlane(workspace, "kirakira-agent-memory");

    const audit = buildEamParityAudit({
      referenceRoot: reference,
      workspaceRoot: workspace,
    });

    expect(audit.summary).toMatchObject({
      exact: 1,
      equivalent: 2,
      drift: 0,
      missing: 0,
    });
    expect(audit.sections[0].rows).toContainEqual(
      expect.objectContaining({
        sourceName: "eamd",
        targetName: "kirakirad",
        status: "equivalent",
      }),
    );
  });

  it("reports missing source entries and renders markdown evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "kirakira-parity-"));
    const reference = join(root, "reference");
    const workspace = join(root, "workspace");

    createPackage(reference, "memory-store");
    mkdirSync(join(workspace, "packages"), { recursive: true });
    mkdirSync(join(reference, "docs", "plane"), { recursive: true });
    mkdirSync(join(workspace, "docs", "plane"), { recursive: true });

    const audit = buildEamParityAudit({
      referenceRoot: reference,
      workspaceRoot: workspace,
    });
    const markdown = renderEamParityAudit(audit, "markdown");

    expect(audit.summary.missing).toBe(1);
    expect(markdown).toContain("| `memory-store` | `memory-store` | missing |");
  });

  it("parses aliases, format, write path, and fail-on-missing options", () => {
    const options = normalizeAuditArgs([
      "--workspace",
      "workspace",
      "--reference",
      "reference",
      "--format",
      "json",
      "--depth",
      "files",
      "--sample-size",
      "3",
      "--write",
      "audit.json",
      "--fail-on-missing",
      "--alias",
      "eamd=kirakirad",
      "--prefix-alias",
      "eam-agent=kirakira-agent",
    ]);

    expect(options.format).toBe("json");
    expect(options.depth).toBe("files");
    expect(options.sampleSize).toBe(3);
    expect(options.failOnMissing).toBe(true);
    expect(options.nameAliases.eamd).toBe("kirakirad");
    expect(options.prefixAliases["eam-agent"]).toBe("kirakira-agent");
    expect(options.writePath).toMatch(/audit\.json$/);
  });

  it("detects file-level drift when requested", () => {
    const root = mkdtempSync(join(tmpdir(), "kirakira-parity-"));
    const reference = join(root, "reference");
    const workspace = join(root, "workspace");

    createPackage(reference, "memory-service");
    createPackage(workspace, "memory-service");
    writeFileSync(
      join(reference, "packages", "memory-service", "src", "retain.ts"),
      "export const retain = true;\n",
      "utf8",
    );
    writeFileSync(
      join(workspace, "packages", "memory-service", "src", "local-only.ts"),
      "export const local = true;\n",
      "utf8",
    );
    mkdirSync(join(reference, "docs", "plane"), { recursive: true });
    mkdirSync(join(workspace, "docs", "plane"), { recursive: true });

    const audit = buildEamParityAudit({
      referenceRoot: reference,
      workspaceRoot: workspace,
      depth: "files",
      sampleSize: 1,
    });
    const packageRow = audit.sections[0].rows.find(
      (row) => row.sourceName === "memory-service",
    );
    const markdown = renderEamParityAudit(audit, "markdown");

    expect(audit.summary.drift).toBe(1);
    expect(packageRow).toMatchObject({
      status: "drift",
      fileAudit: {
        missing: 1,
        extra: 1,
        missingSamples: ["src/retain.ts"],
        extraSamples: ["src/local-only.ts"],
      },
    });
    expect(markdown).toContain("1 missing");
    expect(markdown).toContain("src/retain.ts");
  });

  it("normalizes package-specific Python namespaces and docs-plane filenames", () => {
    const root = mkdtempSync(join(tmpdir(), "kirakira-parity-"));
    const reference = join(root, "reference");
    const workspace = join(root, "workspace");

    createPackage(reference, "memory-pipeline");
    createPackage(workspace, "memory-pipeline");
    writeFile(
      reference,
      "packages/memory-pipeline/src/eam_memory_pipeline/config.py",
      "MEMORY = True\n",
    );
    writeFile(
      workspace,
      "packages/memory-pipeline/src/kirakira_memory_pipeline/config.py",
      "MEMORY = True\n",
    );
    writeFile(
      workspace,
      "packages/memory-pipeline/src/kirakira_memory_pipeline/__pycache__/config.cpython-314.pyc",
      "cache",
    );

    createPackage(reference, "model-gateway");
    createPackage(workspace, "model-gateway");
    writeFile(
      reference,
      "packages/model-gateway/src/eam_model_gateway/client.py",
      "MODEL = True\n",
    );
    writeFile(
      workspace,
      "packages/model-gateway/src/kirakira_model_gateway/client.py",
      "MODEL = True\n",
    );

    createDocsPlane(reference, "eam-agent-tracing");
    createDocsPlane(workspace, "kirakira-agent-tracing");
    writeFile(
      reference,
      "docs/plane/eam-agent-tracing/02-span-taxonomy/eam-custom-attributes.md",
      "# EAM attributes\n",
    );
    writeFile(
      workspace,
      "docs/plane/kirakira-agent-tracing/02-span-taxonomy/kirakira-custom-attributes.md",
      "# Kirakira attributes\n",
    );

    const normalizedAudit = buildEamParityAudit({
      referenceRoot: reference,
      workspaceRoot: workspace,
      depth: "files",
    });
    const rawPathAudit = buildEamParityAudit({
      referenceRoot: reference,
      workspaceRoot: workspace,
      depth: "files",
      filePathRenameRules: [],
    });

    expect(rawPathAudit.summary.drift).toBe(3);
    expect(normalizedAudit.summary.drift).toBe(0);
    expect(normalizedAudit.summary).toMatchObject({
      exact: 2,
      equivalent: 1,
      missing: 0,
    });
    expect(
      normalizedAudit.sections[0].rows.find(
        (row) => row.sourceName === "memory-pipeline",
      ),
    ).toMatchObject({
      status: "exact",
      fileAudit: {
        missing: 0,
        extra: 0,
        renamed: 1,
      },
    });
  });

  it("keeps truly missing normalized files as drift", () => {
    const root = mkdtempSync(join(tmpdir(), "kirakira-parity-"));
    const reference = join(root, "reference");
    const workspace = join(root, "workspace");

    createPackage(reference, "memory-pipeline");
    createPackage(workspace, "memory-pipeline");
    writeFile(
      reference,
      "packages/memory-pipeline/src/eam_memory_pipeline/config.py",
      "MEMORY = True\n",
    );
    mkdirSync(
      join(workspace, "packages", "memory-pipeline", "src", "kirakira_memory_pipeline"),
      { recursive: true },
    );
    mkdirSync(join(reference, "docs", "plane"), { recursive: true });
    mkdirSync(join(workspace, "docs", "plane"), { recursive: true });

    const audit = buildEamParityAudit({
      referenceRoot: reference,
      workspaceRoot: workspace,
      depth: "files",
    });
    const packageRow = audit.sections[0].rows.find(
      (row) => row.sourceName === "memory-pipeline",
    );

    expect(audit.summary.drift).toBe(1);
    expect(packageRow).toMatchObject({
      status: "drift",
      fileAudit: {
        missing: 1,
        missingSamples: [
          "src/eam_memory_pipeline/config.py -> src/kirakira_memory_pipeline/config.py",
        ],
      },
    });
  });
});

function createPackage(root: string, name: string): void {
  const packageRoot = join(root, "packages", name);
  mkdirSync(join(packageRoot, "src"), { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name }), "utf8");
}

function createDocsPlane(root: string, name: string): void {
  const docsRoot = join(root, "docs", "plane", name);
  mkdirSync(docsRoot, { recursive: true });
  writeFileSync(join(docsRoot, "README.md"), `# ${name}\n`, "utf8");
}

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}
