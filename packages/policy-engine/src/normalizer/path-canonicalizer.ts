import { homedir } from "node:os";
import { isAbsolute, normalize, resolve } from "node:path";

function expandLeadingTilde(p: string): string {
  const h = homedir().replace(/\\/g, "/");
  if (p === "~" || p === "~/") return h;
  if (p.startsWith("~/")) return normalize(`${h}/${p.slice(2)}`).replace(/\\/g, "/");
  const m = /^~([^/]*)((?:\/).*)?$/.exec(p);
  if (m && !m[1] && m[2]) return normalize(`${h}${m[2]}`).replace(/\\/g, "/");
  return p;
}

export function canonicalizePath(rawPath: string, workspaceRoot: string): string {
  let p = rawPath.trim().replace(/\\/g, "/");
  if (p.startsWith("~")) p = expandLeadingTilde(p);
  const rooted = isAbsolute(p) ? p : resolve(workspaceRoot, p).replace(/\\/g, "/");
  return normalize(rooted.replace(/\\/g, "/")).replace(/\\/g, "/");
}

export function isWithinWorkspace(path: string, workspaceRoot: string): boolean {
  try {
    const w = canonicalizePath(workspaceRoot, workspaceRoot).replace(/\/?$/, "");
    const x = canonicalizePath(path, workspaceRoot).replace(/\/?$/, "");
    return x === w || x.startsWith(`${w}/`);
  } catch {
    return false;
  }
}

/** Paths like ~/.ssh, ~/.aws; also /etc/passwd and /etc/shadow. */
export function isDenyPath(path: string): boolean {
  let n = path.trim().replace(/\\/g, "/");
  if (n.startsWith("~")) n = expandLeadingTilde(n);
  n = n.replace(/\/+/g, "/").toLowerCase();

  if (/^\/etc\/passwd(\/|$)/.test(n)) return true;
  if (/^\/etc\/shadow(\/|$)/.test(n)) return true;

  return (
    /(^|\/)\.ssh(\/|$)/.test(n) ||
    /(^|\/)\.aws(\/|$)/.test(n) ||
    /(^|\/)\.gnupg(\/|$)/.test(n) ||
    /(^|\/)\.azure(\/|$)/.test(n) ||
    /(^|\/)\.config\/gcloud(\/|$)/.test(n)
  );
}
