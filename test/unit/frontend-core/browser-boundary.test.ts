import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceFiles = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });

const forbiddenFrontendImports = [
  "@kirakira/event-store",
  "@kirakira/runtime-daemon",
  "@kirakira/orchestrator-kernel",
  "better-sqlite3",
  "from \"node:",
  "from 'node:",
  "from \"ws\"",
  "from 'ws'",
];

describe("frontend-core browser boundary", () => {
  it("keeps browser UI source free of Node and runtime implementation imports", () => {
    const roots = [
      join(process.cwd(), "packages", "frontend-core", "src"),
      join(process.cwd(), "packages", "frontend-app", "src"),
    ];
    const violations = roots.flatMap((root) => sourceFiles(root)).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return forbiddenFrontendImports
        .filter((needle) => text.includes(needle))
        .map((needle) => ({ file, needle }));
    });

    expect(violations).toEqual([]);
  });

  it("keeps runtime-contracts source browser-safe and serializable", () => {
    const root = join(process.cwd(), "packages", "runtime-contracts", "src");
    const violations = sourceFiles(root).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [
        "@kirakira/event-store",
        "@kirakira/runtime-daemon",
        "@kirakira/orchestrator-kernel",
        "@kirakira/agent-runtime",
        "better-sqlite3",
        "from \"node:",
        "from 'node:",
        "from \"ws\"",
        "from 'ws'",
      ]
        .filter((needle) => text.includes(needle))
        .map((needle) => ({ file, needle }));
    });

    expect(violations).toEqual([]);
  });
});
