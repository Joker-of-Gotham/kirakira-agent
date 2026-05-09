import { createHash } from "node:crypto";
import fs from "node:fs";
import { resolveWorkspacePath } from "./workspace-path.js";

export type FileHashResult = {
  path: string;
  hash: string;
  algorithm: string;
  size: number;
};

/** Resolve path under workspace and hash file contents with SHA-256 (streaming). */
export function hashFile(workspaceRoot: string, userPath: string): FileHashResult {
  const abs = resolveWorkspacePath(workspaceRoot, userPath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    throw new Error(`Not a file: ${userPath}`);
  }
  const st = fs.statSync(abs);
  const hash = createHash("sha256");
  const fd = fs.openSync(abs, "r");
  try {
    const buf = Buffer.allocUnsafe(Math.min(1024 * 1024, Math.max(st.size, 4096)));
    let offset = 0;
    while (offset < st.size) {
      const n = fs.readSync(fd, buf, 0, buf.length, offset);
      if (n <= 0) break;
      hash.update(buf.subarray(0, n));
      offset += n;
    }
  } finally {
    fs.closeSync(fd);
  }
  return {
    path: userPath,
    hash: hash.digest("hex"),
    algorithm: "sha256",
    size: st.size,
  };
}
