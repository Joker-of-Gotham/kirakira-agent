import { mkdir, appendFile, readFile, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { getUserSessionsDir } from "@kirakira/core";
import type { SessionEvent } from "@kirakira/core";

export function resolveSessionsDir(): string {
  return getUserSessionsDir();
}

export function sessionFilePath(sessionId: string, root?: string): string {
  const base = root ?? resolveSessionsDir();
  const safe = sessionId.replace(/[^\w.-]/g, "_");
  return join(base, `${safe}.jsonl`);
}

export async function ensureSessionsDir(root?: string): Promise<string> {
  const dir = root ?? resolveSessionsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function appendSessionEvent(
  sessionId: string,
  event: SessionEvent,
  root?: string,
): Promise<void> {
  const dir = await ensureSessionsDir(root);
  const fp = sessionFilePath(sessionId, dir);
  await appendFile(fp, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readSessionEvents(
  sessionId: string,
  root?: string,
): Promise<SessionEvent[]> {
  const dir = root ?? resolveSessionsDir();
  const fp = sessionFilePath(sessionId, dir);
  const raw = await readFile(fp, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const events: SessionEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as SessionEvent);
    } catch {
      continue;
    }
  }
  return events;
}

export async function listSessionFiles(root?: string): Promise<string[]> {
  const dir = await ensureSessionsDir(root);
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith(".jsonl")).map((n) => n.replace(/\.jsonl$/, ""));
}

export async function deleteSessionFile(sessionId: string, root?: string): Promise<void> {
  const dir = root ?? resolveSessionsDir();
  await unlink(sessionFilePath(sessionId, dir));
}

export async function sessionFileMtime(sessionId: string, root?: string): Promise<Date> {
  const dir = root ?? resolveSessionsDir();
  const st = await stat(sessionFilePath(sessionId, dir));
  return st.mtime;
}
