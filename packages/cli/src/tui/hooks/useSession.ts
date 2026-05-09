import { useState, useCallback } from "react";
import type { Session, SessionEvent, SessionMode } from "@kirakira/core";
import { createSession, resumeSession } from "../../session/manager.js";
import { appendSessionEvent } from "../../session/store.js";

function nowIso(): string {
  return new Date().toISOString();
}

function mapToSessionMode(mode: string): SessionMode {
  switch (mode) {
    case "agent": return "repl";
    case "debug": return "exec";
    case "plan":  return "plan";
    case "ask":   return "ask";
    default:      return "repl";
  }
}

interface UseSessionReturn {
  session: Session | null;
  init: (model: string, mode: string, workspaceName: string) => Promise<void>;
  resume: (id: string) => Promise<SessionEvent[]>;
  appendEvent: (event: Omit<SessionEvent, "sessionId" | "traceId">) => Promise<void>;
  finish: (reason: string) => Promise<void>;
  reset: (model: string, mode: string, workspaceName: string) => Promise<void>;
}

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);

  const init = useCallback(async (model: string, mode: string, workspaceName: string) => {
    const s = await createSession({
      model,
      mode: mapToSessionMode(mode),
      workspaceName,
    });
    setSession(s);
  }, []);

  const resume = useCallback(async (id: string): Promise<SessionEvent[]> => {
    const { session: s, events } = await resumeSession(id);
    setSession(s);
    return events;
  }, []);

  const appendEvent = useCallback(async (event: Omit<SessionEvent, "sessionId" | "traceId">) => {
    if (!session) return;
    await appendSessionEvent(session.id, {
      ...event,
      sessionId: session.id,
      traceId: session.traceId,
    } as SessionEvent);
  }, [session]);

  const finish = useCallback(async (reason: string) => {
    if (!session) return;
    await appendSessionEvent(session.id, {
      ts: nowIso(),
      event: "session.finish",
      sessionId: session.id,
      traceId: session.traceId,
      data: { reason },
    });
  }, [session]);

  const reset = useCallback(async (model: string, mode: string, workspaceName: string) => {
    if (session) {
      await appendSessionEvent(session.id, {
        ts: nowIso(),
        event: "session.finish",
        sessionId: session.id,
        traceId: session.traceId,
        data: { reason: "new" },
      });
    }
    const s = await createSession({
      model,
      mode: mapToSessionMode(mode),
      workspaceName,
    });
    setSession(s);
  }, [session]);

  return { session, init, resume, appendEvent, finish, reset };
}
