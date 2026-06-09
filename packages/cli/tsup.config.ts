import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/commands/**/*.ts",
    "src/commands/**/*.tsx",
    "src/gateway/**/*.ts",
    "src/util/**/*.ts",
    "src/parser/**/*.ts",
    "src/approval/**/*.ts",
    "src/output/**/*.ts",
    "src/session/**/*.ts",
    "src/trace/**/*.ts",
    "src/registry/**/*.ts",
    "src/plugin/**/*.ts",
    "src/tui/**/*.ts",
    "src/tui/**/*.tsx",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  external: [
    "@kirakira/core",
    "@kirakira/config-resolver",
    "@kirakira/skill-runtime",
    "@kirakira/mcp-adapter",
    "@kirakira/policy-engine",
    "@kirakira/audit-ledger",
  ],
});
