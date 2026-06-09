import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
