import { basename } from "node:path";
import { randomUUID } from "node:crypto";

import type { PolicyInput } from "@kirakira/core";

import { canonicalizePath } from "../normalizer/path-canonicalizer.js";

import type { PepContext } from "./pep-types.js";

/** Common request envelope fields generated at enforcement time (not part of PEP context derivation). */
export function requestEnvelope(context: Pick<PepContext, "sessionId" | "traceId">) {
  return {
    version: "kirakira.policyinput.v1" as const,
    request_id: randomUUID(),
    session_id: context.sessionId,
    trace_id: context.traceId,
    timestamp: new Date().toISOString(),
  };
}

export function principalFrom(context: PepContext): PolicyInput["principal"] {
  return {
    user_id: context.userId,
    roles: context.roles,
    authn_method: "token",
    device_trust: "unknown",
    interactive: context.interactive,
  };
}

export function workspaceFrom(context: PepContext): PolicyInput["workspace"] {
  const root = canonicalizePath(context.workspaceRoot, context.workspaceRoot);
  const slug = basename(root.replace(/\/$/, ""));
  return {
    workspace_id: slug.length > 0 ? slug : "default",
    root,
  };
}
