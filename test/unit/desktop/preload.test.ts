import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KIRAKIRA_PRELOAD_API_KEY,
  KIRAKIRA_PRELOAD_API_METHODS,
  RUNTIME_IPC_CHANNELS,
} from "../../../apps/desktop/src/main/preload-contract.js";

const preloadSource = () =>
  readFileSync(resolve("apps/desktop/src/main/preload.ts"), "utf8");

describe("desktop preload bridge", () => {
  it("exposes desktop runtime through a dedicated bridge contract", () => {
    const source = preloadSource();

    expect(KIRAKIRA_PRELOAD_API_KEY).toBe("kirakiraRuntime");
    expect(KIRAKIRA_PRELOAD_API_METHODS).toContain("getStatus");
    expect(RUNTIME_IPC_CHANNELS.getStatus).toBe("runtime:getStatus");
    expect(source).toContain("contextBridge.exposeInMainWorld(KIRAKIRA_PRELOAD_API_KEY");
    expect(source).toContain("ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.getStatus)");
    expect(source).not.toContain("get_status");
    expect(source).not.toContain("send: ipcRenderer.send");
    expect(source).not.toContain("invoke: ipcRenderer.invoke");
  });
});
