import { execFile } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execResultSchema } from "@kirakira/core";
import { getRepoRoot } from "../../helpers/repo-root.js";
import { startContractLlmServer } from "../../helpers/contract-llm-server.js";
import type { Server } from "node:http";

function execFileAsync(
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeout: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      resolve(stdout);
    });
  });
}

const root = getRepoRoot(import.meta.url);
const cliRun = path.join(root, "packages/cli/bin/run.js");

let server: Server;
let port: number;

beforeAll(async () => {
  const s = await startContractLlmServer();
  server = s.server;
  port = s.port;
});

afterAll(() => {
  server?.close();
});

describe("exec --json contract", () => {
  it("stdout parses as execResultSchema", async () => {
    const out = await execFileAsync(
      process.execPath,
      [cliRun, "exec", "-p", "contract-check", "--json"],
      {
        cwd: path.join(root, "packages/cli"),
        env: {
          ...process.env,
          LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
          LLM_API_KEY: "test-key",
        },
        timeout: 30000,
      },
    );
    const data: unknown = JSON.parse(out.trim());
    const r = execResultSchema.safeParse(data);
    expect(r.success).toBe(true);
  }, 35000);
});
