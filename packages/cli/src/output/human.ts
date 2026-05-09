import type { ExecResult, OutputEvent } from "@kirakira/core";
import chalk from "chalk";

function tsLabel(ts: string): string {
  return chalk.dim(ts);
}

export function formatOutputEventHuman(ev: OutputEvent): string {
  const prefix = `${tsLabel(ev.ts)} ${chalk.cyan(ev.event)}`;
  const ids = chalk.dim(`${ev.sessionId} ${ev.traceId}`);
  const data = ev.data ? `\n${chalk.gray(JSON.stringify(ev.data, null, 2))}` : "";
  return `${prefix} ${ids}${data}`;
}

export function formatExecResultHuman(res: ExecResult): string {
  const badge =
    res.status === "ok"
      ? chalk.green("[ok]")
      : chalk.red("[error]");
  const head = `${badge} session=${chalk.yellow(res.sessionId)} trace=${chalk.yellow(res.traceId)}`;

  if (res.status === "ok" && res.result) {
    return `${head}\n${res.result.summary}\n${chalk.dim(res.result.artifacts.join(", "))}`;
  }

  if (res.error) {
    return `${head}\n${chalk.red(res.error.code)}: ${res.error.message}`;
  }

  return head;
}
