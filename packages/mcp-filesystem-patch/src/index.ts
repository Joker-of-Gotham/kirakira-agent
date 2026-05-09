import path from "node:path";
import { runPatchServer } from "./server.js";

function workspaceRoot(): string {
  const i = process.argv.indexOf("--workspace");
  if (i !== -1 && process.argv[i + 1]) {
    return path.resolve(process.argv[i + 1]);
  }
  return process.cwd();
}

await runPatchServer({ workspaceRoot: workspaceRoot() });
