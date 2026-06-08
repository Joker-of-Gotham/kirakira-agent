#!/usr/bin/env node
import { spawn } from "node:child_process";

import { ensureMcpConfig } from "./kirakira-common.mjs";
import { loadRuntimeProfiles, resolveRuntimeProfile } from "./runtime-profile.mjs";

const containerProfile = resolveRuntimeProfile("container", loadRuntimeProfiles(), {});
const workspaceRoot = containerProfile.workspaceRoot;
const appRoot = containerProfile.appRoot;
const cliEntry = process.env.KIRAKIRA_CLI_ENTRY || `${appRoot}/packages/cli/bin/run.js`;
const args = process.argv.slice(2);

process.env.KIRAKIRA_RUNTIME_PROFILE = containerProfile.name;
process.env.KIRAKIRA_WORKSPACE_ROOT = workspaceRoot;
process.env.KIRAKIRA_APP_ROOT = appRoot;
process.env.KIRAKIRA_MCP_WORKSPACE_ROOT = containerProfile.mcp?.workspaceRoot ?? workspaceRoot;
process.env.KIRAKIRA_MCP_APP_ROOT = containerProfile.mcp?.appRoot ?? appRoot;
process.env.FORCE_COLOR ??= "3";
process.env.COLORTERM ??= "truecolor";
process.env.TERM ??= "xterm-256color";

ensureMcpConfig(workspaceRoot, containerProfile);

const child = spawn(process.execPath, [cliEntry, ...(args.length > 0 ? args : ["chat"])], {
  cwd: workspaceRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
