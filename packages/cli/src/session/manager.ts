import type { Session, SessionEvent, SessionMode, SessionStatus } from "@kirakira/core";
import {
  generateSessionId,
  generateTraceId,
} from "@kirakira/core";
import {
  appendSessionEvent,
  deleteSessionFile,
  listSessionFiles,
  readSessionEvents,
  resolveSessionsDir,
  sessionFileMtime,
  ensureSessionsDir,
} from "./store.js";

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateSessionOptions {
  model: string;
  mode: SessionMode;
  workspaceName?: string;
  root?: string;
}

export async function createSession(opts: CreateSessionOptions): Promise<Session> {
  const id = generateSessionId();
  const traceId = generateTraceId();
  await ensureSessionsDir(opts.root);

  const session: Session = {
    id,
    traceId,
    startedAt: nowIso(),
    workspaceName: opts.workspaceName,
    model: opts.model,
    mode: opts.mode,
    status: "active",
    eventCount: 0,
  };

  const startEv: SessionEvent = {
    ts: session.startedAt,
    event: "session.start",
    sessionId: id,
    traceId,
    data: { model: opts.model, mode: opts.mode, workspaceName: opts.workspaceName },
  };

  await appendSessionEvent(id, startEv, opts.root);
  session.eventCount = 1;
  return session;
}

export async function resumeSession(
  sessionId: string,
  root?: string,
): Promise<{ session: Session; events: SessionEvent[] }> {
  const events = await readSessionEvents(sessionId, root);
  if (events.length === 0) {
    throw new Error(`session not found: ${sessionId}`);
  }
  const start = events.find((e) => e.event === "session.start");
  const traceId = start?.traceId ?? events[0]!.traceId;
  const startedAt = start?.ts ?? events[0]!.ts;
  const model =
    (start?.data?.model as string | undefined) ??
    (typeof start?.data === "object" && start?.data && "model" in start.data
      ? String((start.data as Record<string, unknown>).model)
      : "unknown");
  const mode =
    (start?.data?.mode as SessionMode | undefined) ??
    "repl";

  const last = events[events.length - 1]!;
  let status: SessionStatus = "active";
  if (last.event === "session.finish") status = "completed";
  if (last.event === "error") status = "error";

  const session: Session = {
    id: sessionId,
    traceId,
    startedAt,
    workspaceName: start?.data?.workspaceName as string | undefined,
    model,
    mode,
    status,
    eventCount: events.length,
  };

  return { session, events };
}

export async function listSessions(root?: string): Promise<Session[]> {
  const ids = await listSessionFiles(root);
  const sessions: Session[] = [];
  for (const id of ids) {
    try {
      const { session } = await resumeSession(id, root);
      sessions.push(session);
    } catch {
      continue;
    }
  }
  sessions.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return sessions;
}

export interface PruneOptions {
  maxAgeMs?: number;
  keepActive?: boolean;
  root?: string;
}

export async function pruneSessions(opts: PruneOptions = {}): Promise<string[]> {
  const maxAge = opts.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAge;
  const removed: string[] = [];
  const ids = await listSessionFiles(opts.root);
  for (const id of ids) {
    try {
      const { session } = await resumeSession(id, opts.root);
      if (opts.keepActive && session.status === "active") continue;
      const mtime = await sessionFileMtime(id, opts.root).catch(() => null);
      if (!mtime) continue;
      if (mtime.getTime() < cutoff) {
        await deleteSessionFile(id, opts.root);
        removed.push(id);
      }
    } catch {
      continue;
    }
  }
  return removed;
}

export function getDefaultSessionsRoot(): string {
  return resolveSessionsDir();
}
