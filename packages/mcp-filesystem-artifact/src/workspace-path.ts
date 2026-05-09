import path from "node:path";

export function resolveWorkspacePath(workspaceRoot: string, userPath: string): string {
  const abs = path.resolve(workspaceRoot, userPath);
  const root = path.resolve(workspaceRoot);
  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes workspace: ${userPath}`);
  }
  return abs;
}
