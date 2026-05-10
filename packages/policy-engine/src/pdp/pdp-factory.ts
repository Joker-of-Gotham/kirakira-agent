import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { EmbeddedPdp } from "./embedded-pdp.js";
import { IpcPdp } from "./ipc-pdp.js";
import type { PdpClient } from "./pdp-types.js";

const DEFAULT_BUNDLE_PATH = (): string =>
  join(homedir(), ".kirakira", "policy.bundle.json").replace(/\\/g, "/");

const DEFAULT_IPC_SOCK = (): string => join(homedir(), ".kirakira", "kirakirad.sock");

function defaultEndpoint(): string {
  return process.env.KIRAKIRA_PDP_ENDPOINT
    ?? process.env.KIRAKIRA_PDP_SOCKET
    ?? DEFAULT_IPC_SOCK();
}

function isTcpEndpoint(endpoint: string): boolean {
  return endpoint.toLowerCase().startsWith("tcp://");
}

async function ipcConnectable(endpoint: string): Promise<boolean> {
  if (!isTcpEndpoint(endpoint)) {
    try {
      await access(endpoint, constants.F_OK);
    } catch {
      return false;
    }
  }
  const ipc = new IpcPdp(endpoint, 1500);
  try {
    const h = await ipc.health();
    return h.mode === "ipc" || h.mode === "tcp";
  } catch {
    return false;
  }
}

export async function createPdpClient(options?: {
  bundlePath?: string;
  socketPath?: string;
  endpoint?: string;
}): Promise<PdpClient> {
  const bundlePath =
    typeof options?.bundlePath === "string" && options.bundlePath.length > 0
      ? options.bundlePath
      : typeof process.env.KIRAKIRA_POLICY_BUNDLE === "string" && process.env.KIRAKIRA_POLICY_BUNDLE.length > 0
        ? process.env.KIRAKIRA_POLICY_BUNDLE
      : DEFAULT_BUNDLE_PATH();
  const endpoint =
    typeof options?.endpoint === "string" && options.endpoint.length > 0
      ? options.endpoint
      : typeof options?.socketPath === "string" && options.socketPath.length > 0
        ? options.socketPath
      : defaultEndpoint();

  const explicitTransport = (process.env.KIRAKIRA_PDP_TRANSPORT ?? "").trim().toLowerCase();
  if (explicitTransport === "embedded") {
    console.info("[@kirakira/policy-engine] PDP transport: embedded (bundle %s)", bundlePath);
    return new EmbeddedPdp(bundlePath);
  }

  const endpointWasExplicit =
    Boolean(options?.endpoint) ||
    Boolean(options?.socketPath) ||
    Boolean(process.env.KIRAKIRA_PDP_ENDPOINT) ||
    Boolean(process.env.KIRAKIRA_PDP_SOCKET);
  const shouldProbeIpc =
    endpointWasExplicit ||
    explicitTransport === "ipc" ||
    explicitTransport === "tcp" ||
    process.platform !== "win32";

  if (shouldProbeIpc && await ipcConnectable(endpoint)) {
    const transport = isTcpEndpoint(endpoint) ? "tcp" : "ipc";
    console.info("[@kirakira/policy-engine] PDP transport: %s (%s)", transport, endpoint);
    return new IpcPdp(endpoint);
  }

  const log = shouldProbeIpc ? console.warn : console.info;
  log(
    "[@kirakira/policy-engine] PDP endpoint unavailable (%s); using embedded PDP (bundle %s)",
    endpoint,
    bundlePath,
  );
  return new EmbeddedPdp(bundlePath);
}
