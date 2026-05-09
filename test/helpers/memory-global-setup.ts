import net from "node:net";

import { TEST_PG_URL } from "./memory-env.js";

function pgHostPort(url: string): { host: string; port: number } {
  const normalized = url.replace(/^postgres:\/\//, "http://");
  const u = new URL(normalized);
  return { host: u.hostname, port: u.port ? Number(u.port) : 5432 };
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

/**
 * Vitest global setup: probes Postgres from `TEST_PG_URL` so synchronous
 * `skipIfNoDocker()` can gate integration tests without per-file async init.
 */
export default async function memoryGlobalSetup(): Promise<void> {
  const { host, port } = pgHostPort(TEST_PG_URL);
  const up = await probeTcp(host, port, 5_000);
  process.env.__KIRAKIRA_MEMORY_PG_UP__ = up ? "1" : "0";
}
