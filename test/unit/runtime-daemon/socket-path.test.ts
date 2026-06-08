import { describe, expect, it } from "vitest";
import {
  daemonSocketWebSocketUrl,
  isWindowsNamedPipePath,
  resolveDaemonSocketPath,
} from "../../../packages/runtime-daemon/src/ipc/socket-path.js";

describe("daemon socket path resolution", () => {
  it("keeps configured POSIX socket paths on POSIX platforms", () => {
    const socketPath = resolveDaemonSocketPath(".kirakira/runtime/daemon.sock", {
      platform: "linux",
      cwd: "/repo",
      homeDir: "/home/test",
    });

    expect(socketPath).toBe(".kirakira/runtime/daemon.sock");
  });

  it("maps relative .sock paths to stable Windows named pipes", () => {
    const first = resolveDaemonSocketPath(".kirakira/runtime/daemon.sock", {
      platform: "win32",
      cwd: "C:\\repo\\kirakira-agent",
      homeDir: "C:\\Users\\test",
    });
    const second = resolveDaemonSocketPath(".kirakira/runtime/daemon.sock", {
      platform: "win32",
      cwd: "C:\\repo\\kirakira-agent",
      homeDir: "C:\\Users\\test",
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^\\\\\.\\pipe\\kirakira-agent-daemon-[0-9a-f]{12}$/u);
    expect(isWindowsNamedPipePath(first)).toBe(true);
  });

  it("preserves explicit Windows named pipes", () => {
    const pipe = "\\\\.\\pipe\\kirakira-agent-custom";

    expect(resolveDaemonSocketPath(pipe, { platform: "win32" })).toBe(pipe);
    expect(isWindowsNamedPipePath(pipe)).toBe(true);
  });

  it("builds ws unix URLs from resolved socket paths", () => {
    expect(daemonSocketWebSocketUrl("/tmp/kirakira.sock")).toBe("ws+unix:/tmp/kirakira.sock:/");
  });
});
