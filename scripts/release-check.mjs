#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const skipDocker = args.has("--skip-docker");
const skipHydrated = args.has("--skip-hydrated");
const fullLifecycle = args.has("--full-lifecycle");

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function quoteWindowsArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(text)) {
    return text;
  }
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, "$&$&")}"`;
}

function runCommand(command, commandArgs, env) {
  if (process.platform === "win32") {
    return spawnSync([command, ...commandArgs].map(quoteWindowsArg).join(" "), {
      stdio: "inherit",
      shell: true,
      env,
    });
  }
  return spawnSync(command, commandArgs, {
    stdio: "inherit",
    env,
  });
}

const commands = [
  ["runtime-contracts typecheck", pnpm, ["--filter", "@kirakira/runtime-contracts", "typecheck"]],
  ["config-resolver typecheck", pnpm, ["--filter", "@kirakira/config-resolver", "typecheck"]],
  ["cli typecheck", pnpm, ["--filter", "@kirakira/cli", "typecheck"]],
  ["runtime-daemon typecheck", pnpm, ["--filter", "@kirakira/runtime-daemon", "typecheck"]],
  ["web build", pnpm, ["--filter", "@kirakira/web", "build"]],
  ["desktop build", pnpm, ["--filter", "@kirakira/desktop", "build"]],
  [
    "focused vitest",
    pnpm,
    [
      "exec",
      "vitest",
      "run",
      "test/unit/runtime-contracts/gates.test.ts",
      "test/unit/runtime-contracts/readiness.test.ts",
      "test/unit/config-resolver/resolved-state.test.ts",
      "test/unit/cli/runtime-ready-command.test.ts",
      "test/unit/cli/runtime-profile-command.test.ts",
      "test/unit/cli/runtime-doctor-command.test.ts",
      "test/unit/runtime-daemon/agent-mcp-tool-gateway.test.ts",
      "test/unit/runtime-daemon/browser-gateway-server.test.ts",
      "test/unit/runtime-daemon/gateway-bridge.test.ts",
      "test/smoke/runtime-daemon/composition-smoke.test.ts",
      "test/smoke/runtime-daemon/mcp-live-propagation-smoke.test.ts",
      "test/unit/frontend-app/command-actions.test.ts",
      "test/unit/frontend-core/mcp-playground.test.ts",
      "test/unit/desktop/preload.test.ts",
      "test/unit/scripts/runtime-integration-gate.test.ts",
      "test/unit/scripts/runtime-full-lifecycle-gate.test.ts",
      "test/unit/scripts/upgrade-readiness.test.ts",
      "test/unit/core/model-providers.test.ts",
      "test/unit/core/model-metadata.test.ts",
      "test/unit/registry-client/verifier.test.ts",
      "test/unit/skill-runtime/trust.test.ts",
    ],
  ],
  ["model-gateway pytest", "python", ["-m", "pytest", "test/unit/model-gateway"]],
  ["runtime integration gate", "node", ["scripts/runtime-integration-gate.mjs", "--gate", "upgrade"]],
  ["EAM parity", "node", ["scripts/eam-parity-audit.mjs", "--depth", "files"]],
  ["upgrade readiness", "node", ["scripts/upgrade-readiness.mjs", "--profile", "workbench-host", "--format", "json"]],
];

if (!skipHydrated) {
  commands.splice(commands.length - 2, 0, [
    "presentation quality",
    "node",
    [
      "scripts/presentation-quality-gate.mjs",
      "--profile",
      "workbench-host",
      "--format",
      "markdown",
      "--artifact",
      "tmp/presentation-quality/workbench-host.json",
      "--fail-on-issues",
    ],
  ]);
  commands.splice(commands.length - 2, 0, [
    "hydrated visual QA",
    "node",
    [
      "scripts/presentation-hydrated-visual-qa.mjs",
      "--gate",
      "presentation-hydrated-visual-qa",
      "--profile",
      "workbench-host",
      "--timeout-ms",
      "180000",
      "--skip-infra",
      "--skip-daemon",
      "--live",
    ],
  ]);
}

if (fullLifecycle && !skipDocker) {
  commands.push([
    "full Docker lifecycle",
    "node",
    [
      "scripts/runtime-full-lifecycle-gate.mjs",
      "--gate",
      "runtime-full-lifecycle",
      "--profile",
      "workbench-host",
      "--live",
      "--timeout-ms",
      "240000",
    ],
  ]);
}

for (const [label, command, commandArgs] of commands) {
  console.log(`\n==> ${label}`);
  const result = runCommand(command, commandArgs, {
    ...process.env,
    ...(label === "hydrated visual QA" ? { VITE_KIRAKIRA_RUNTIME_MODE: "mock" } : {}),
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nRelease check completed.");
