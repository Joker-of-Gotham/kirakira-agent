import type { EventFilter } from "@kirakira/runtime-contracts";
import { ulid } from "ulid";

export interface SessionSubscription {
  id: string;
  runId?: string;
  filter?: EventFilter;
  createdAt: number;
}

export interface Session {
  id: string;
  clientId: string;
  runIds: string[];
  subscriptions: SessionSubscription[];
  createdAt: number;
  lastActivity: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  touch(session: Session): void {
    session.lastActivity = Date.now();
    this.sessions.set(session.id, session);
  }

  createSession(clientId: string): Session {
    const session: Session = {
      id: ulid(),
      clientId,
      runIds: [],
      subscriptions: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  listSessions(): Session[] {
    return [...this.sessions.values()];
  }

  closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  findSessionByClient(clientId: string): Session | null {
    for (const s of this.sessions.values()) {
      if (s.clientId === clientId) return s;
    }
    return null;
  }

  registerRun(sessionId: string, runId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (!s.runIds.includes(runId)) s.runIds.push(runId);
    this.touch(s);
  }
}
