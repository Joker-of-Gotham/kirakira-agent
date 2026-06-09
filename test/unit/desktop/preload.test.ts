import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const preloadSource = () =>
  readFileSync(resolve("apps/desktop/src/main/preload.ts"), "utf8");

describe("desktop preload bridge", () => {
  it("exposes desktop status through a dedicated IPC channel", () => {
    const source = preloadSource();

    expect(source).toContain("getStatus: () => ipcRenderer.invoke(\"runtime:getStatus\")");
    expect(source).not.toContain("get_status");
    expect(source).not.toContain("send: ipcRenderer.send");
    expect(source).not.toContain("invoke: ipcRenderer.invoke");
  });
});
