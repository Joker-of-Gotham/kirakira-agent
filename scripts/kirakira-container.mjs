#!/usr/bin/env node
import { spawn } from "node:child_process";

import { ensureMcpConfig } from "./kirakira-common.mjs";

const workspaceRoot = process.env.KIRAKIRA_WORKSPACE_ROOT || "/workspace";
const cliEntry = process.env.KIRAKIRA_CLI_ENTRY || "/app/packages/cli/bin/run.js";
const args = process.argv.slice(2);

process.env.FORCE_COLOR ??= "3";
process.env.COLORTERM ??= "truecolor";
process.env.TERM ??= "xterm-256color";

ensureMcpConfig(workspaceRoot);

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
