import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { EmbeddedPdp } from "./embedded-pdp.js";
import { IpcPdp } from "./ipc-pdp.js";
import type { PdpClient } from "./pdp-types.js";

const DEFAULT_BUNDLE_PATH = (): string =>
  join(homedir(), ".kirakira", "policy.bundle.json").replace(/\\/g, "/");

const DEFAULT_IPC_SOCK = (): string => join(homedir(), ".kirakira", "kirakirad.sock");

async function ipcConnectable(sock: string): Promise<boolean> {
  try {
    await access(sock, constants.F_OK);
  } catch {
    return false;
  }
  const ipc = new IpcPdp(sock, 1500);
  try {
    const h = await ipc.health();
    return h.mode === "ipc";
  } catch {
    return false;
  }
}

export async function createPdpClient(options?: {
  bundlePath?: string;
  socketPath?: string;
}): Promise<PdpClient> {
  const bundlePath =
    typeof options?.bundlePath === "string" && options.bundlePath.length > 0
      ? options.bundlePath
      : DEFAULT_BUNDLE_PATH();
  const sockPath =
    typeof options?.socketPath === "string" && options.socketPath.length > 0
      ? options.socketPath
      : DEFAULT_IPC_SOCK();

  if (await ipcConnectable(sockPath)) {
    console.info("[@kirakira/policy-engine] PDP transport: ipc (%s)", sockPath);
    return new IpcPdp(sockPath);
  }

  console.warn(
    "[@kirakira/policy-engine] IPC unavailable (%s); using embedded PDP (bundle %s)",
    sockPath,
    bundlePath,
  );
  return new EmbeddedPdp(bundlePath);
}
