import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

export interface DaemonSocketPathOptions {
  cwd?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

const WINDOWS_PIPE_PREFIX = "\\\\.\\pipe\\";

function platformFrom(options: DaemonSocketPathOptions): NodeJS.Platform {
  return options.platform ?? process.platform;
}

function defaultPosixSocketPath(options: DaemonSocketPathOptions): string {
  return join(options.homeDir ?? homedir(), ".kirakira-agent", "daemon.sock");
}

function sanitizePipeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "") || "daemon";
}

function pipeNameFromSocketPath(socketPath: string, options: DaemonSocketPathOptions): string {
  const cwd = options.cwd ?? process.cwd();
  const absoluteBasis = isAbsolute(socketPath) ? socketPath : resolve(cwd, socketPath);
  const base = sanitizePipeName(basename(socketPath).replace(/\.sock$/iu, ""));
  const digest = createHash("sha256").update(absoluteBasis).digest("hex").slice(0, 12);
  return `kirakira-agent-${base}-${digest}`;
}

export function isWindowsNamedPipePath(socketPath: string): boolean {
  const normalized = socketPath.replace(/\//gu, "\\").toLowerCase();
  return normalized.startsWith("\\\\.\\pipe\\") || normalized.startsWith("\\\\?\\pipe\\");
}

export function resolveDaemonSocketPath(
  socketPath?: string,
  options: DaemonSocketPathOptions = {},
): string {
  const configured = socketPath?.trim();
  if (platformFrom(options) !== "win32") {
    return configured && configured.length > 0 ? configured : defaultPosixSocketPath(options);
  }
  if (configured && isWindowsNamedPipePath(configured)) {
    return configured;
  }
  const pathForName = configured && configured.length > 0
    ? configured
    : defaultPosixSocketPath(options);
  return `${WINDOWS_PIPE_PREFIX}${pipeNameFromSocketPath(pathForName, options)}`;
}

export function daemonSocketWebSocketUrl(socketPath: string): string {
  return `ws+unix:${socketPath}:/`;
}
