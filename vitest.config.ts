import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const workspaceAlias = (packageName: string, packagePath: string) => ({
  find: packageName,
  replacement: resolve(import.meta.dirname, packagePath, "src", "index.ts"),
});

const sourceAlias = (packageName: string, sourcePath: string) => ({
  find: packageName,
  replacement: resolve(import.meta.dirname, sourcePath),
});

export default defineConfig({
  resolve: {
    alias: [
      sourceAlias("@kirakira/core/schemas/audit", "packages/core/src/schemas/audit.ts"),
      sourceAlias(
        "@kirakira/orchestrator-kernel/daemon-orchestrator",
        "packages/orchestrator-kernel/src/daemon-orchestrator.ts",
      ),
      workspaceAlias("@kirakira/agent-runtime", "packages/agent-runtime"),
      workspaceAlias("@kirakira/audit-ledger", "packages/audit-ledger"),
      workspaceAlias("@kirakira/compat", "packages/compat"),
      workspaceAlias("@kirakira/core", "packages/core"),
      workspaceAlias("@kirakira/event-store", "packages/event-store"),
      workspaceAlias("@kirakira/frontend-core", "packages/frontend-core"),
      workspaceAlias("@kirakira/mcp-adapter", "packages/mcp-adapter"),
      workspaceAlias("@kirakira/memory-core", "packages/memory-core"),
      workspaceAlias("@kirakira/memory-store", "packages/memory-store"),
      workspaceAlias("@kirakira/memory-vector", "packages/memory-vector"),
      workspaceAlias("@kirakira/orchestrator-kernel", "packages/orchestrator-kernel"),
      workspaceAlias("@kirakira/policy-engine", "packages/policy-engine"),
      workspaceAlias("@kirakira/runtime-daemon", "packages/runtime-daemon"),
      workspaceAlias("@kirakira/skill-runtime", "packages/skill-runtime"),
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: false,
    testTimeout: 30000,
    globalSetup: ["./test/helpers/memory-global-setup.ts"],
  },
});
