import type { ApprovalKind, SessionAllowEntry } from "@kirakira/core";

/** In-memory session-scoped patterns approved with `allow_session` / shell `!`. */
export class SessionAllowlist {
  private entries: SessionAllowEntry[] = [];

  grant(pattern: string, kind: ApprovalKind): SessionAllowEntry {
    const entry: SessionAllowEntry = {
      pattern,
      kind,
      grantedAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  list(): SessionAllowEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  matches(command: string, kind: ApprovalKind): boolean {
    return this.entries.some((e) => e.kind === kind && commandMatches(e.pattern, command));
  }
}

function commandMatches(pattern: string, command: string): boolean {
  if (pattern === command) return true;
  const re = new RegExp(
    `^${pattern.split("*").map(escapeRe).join(".*")}$`,
  );
  return re.test(command);
}

function escapeRe(s: string): string {
  return s.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
