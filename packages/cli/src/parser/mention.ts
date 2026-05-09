import { sha256Hex } from "@kirakira/core";

export type AttachmentKind =
  | "file"
  | "skill"
  | "mcp"
  | "session"
  | "trace"
  | "memory"
  | "task"
  | "subagent"
  | "artifact"
  | "git";

/** Resolved @mention attachment; digest is a stable hash of the mention key before file/content load. */
export interface Attachment {
  kind: AttachmentKind;
  /** Primary locator (file path, skill name path, MCP server:resource, session id, trace id). */
  path: string;
  /** Logical namespace for routing (e.g. `file`, `skill`, `mcp`). */
  namespace: string;
  /** SHA-256 (hex) of the canonical mention key string until filesystem/content resolution runs. */
  digest: string;
}

function mentionKeyDigest(raw: string): string {
  return sha256Hex(raw);
}

/**
 * Classify a single mention token (without the leading `@`).
 * Priority:
 *   session/ → trace/ → task/ → subagent/ → memory/ → artifact/ → git/
 *   → mcp/ with `:` → skill/ → file path.
 */
export function classifyMentionToken(raw: string): Attachment | null {
  const token = raw.trim();
  if (!token) return null;

  if (token.startsWith("session/")) {
    const id = token.slice("session/".length).trim();
    if (!id) return null;
    return {
      kind: "session",
      path: id,
      namespace: "session",
      digest: mentionKeyDigest(`session:${id}`),
    };
  }

  if (token.startsWith("trace/")) {
    const id = token.slice("trace/".length).trim();
    if (!id) return null;
    return {
      kind: "trace",
      path: id,
      namespace: "trace",
      digest: mentionKeyDigest(`trace:${id}`),
    };
  }

  if (token.startsWith("task/")) {
    const id = token.slice("task/".length).trim();
    if (!id) return null;
    return {
      kind: "task",
      path: id,
      namespace: "task",
      digest: mentionKeyDigest(`task:${id}`),
    };
  }

  if (token.startsWith("subagent/")) {
    const id = token.slice("subagent/".length).trim();
    if (!id) return null;
    return {
      kind: "subagent",
      path: id,
      namespace: "subagent",
      digest: mentionKeyDigest(`subagent:${id}`),
    };
  }

  if (token.startsWith("memory/")) {
    const key = token.slice("memory/".length).trim();
    if (!key) return null;
    return {
      kind: "memory",
      path: key,
      namespace: "memory",
      digest: mentionKeyDigest(`memory:${key}`),
    };
  }

  if (token.startsWith("artifact/")) {
    const key = token.slice("artifact/".length).trim();
    if (!key) return null;
    return {
      kind: "artifact",
      path: key,
      namespace: "artifact",
      digest: mentionKeyDigest(`artifact:${key}`),
    };
  }

  if (token.startsWith("git/")) {
    const key = token.slice("git/".length).trim();
    if (!key) return null;
    return {
      kind: "git",
      path: key,
      namespace: "git",
      digest: mentionKeyDigest(`git:${key}`),
    };
  }

  if (token.startsWith("mcp/")) {
    const rest = token.slice("mcp/".length);
    const colon = rest.indexOf(":");
    if (colon === -1 || colon === 0 || colon === rest.length - 1) return null;
    const server = rest.slice(0, colon).trim();
    const resource = rest.slice(colon + 1).trim();
    if (!server || !resource) return null;
    return {
      kind: "mcp",
      path: `${server}:${resource}`,
      namespace: "mcp",
      digest: mentionKeyDigest(`mcp:${server}:${resource}`),
    };
  }

  if (token.startsWith("skill/")) {
    const name = token.slice("skill/".length).trim();
    if (!name) return null;
    return {
      kind: "skill",
      path: name,
      namespace: "skill",
      digest: mentionKeyDigest(`skill:${name}`),
    };
  }

  return {
    kind: "file",
    path: token,
    namespace: "file",
    digest: mentionKeyDigest(`file:${token}`),
  };
}

const MENTION_RE = /@([^\s@]+)/g;

/**
 * Extract all `@...` mentions from arbitrary text; each is classified independently.
 */
export function parseMentions(input: string): Attachment[] {
  const out: Attachment[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE);
  while ((m = re.exec(input)) !== null) {
    const att = classifyMentionToken(m[1] ?? "");
    if (att) out.push(att);
  }
  return out;
}
