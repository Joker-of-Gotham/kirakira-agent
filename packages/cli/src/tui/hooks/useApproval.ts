import { useState, useCallback } from "react";
import type { ApprovalDecision } from "@kirakira/core";
import type { ApprovalRequest } from "../types.js";
import { SessionAllowlist } from "../../approval/session-allowlist.js";
import { processApprovalDecision } from "../../approval/decision.js";

const allowlist = new SessionAllowlist();

interface UseApprovalReturn {
  queue: ApprovalRequest[];
  current: ApprovalRequest | null;
  enqueue: (req: ApprovalRequest) => void;
  decide: (decision: ApprovalDecision) => { allowed: boolean; remembered: boolean };
  getAllowlist: () => SessionAllowlist;
  autoRun: boolean;
  setAutoRun: (v: boolean) => void;
}

export function useApproval(): UseApprovalReturn {
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [autoRun, setAutoRun] = useState(false);

  const current = queue.length > 0 ? queue[0]! : null;

  const enqueue = useCallback((req: ApprovalRequest) => {
    if (autoRun) return;
    setQueue((prev) => [...prev, req]);
  }, [autoRun]);

  const decide = useCallback((decision: ApprovalDecision): { allowed: boolean; remembered: boolean } => {
    if (!current) return { allowed: false, remembered: false };

    const result = processApprovalDecision(
      { decision, pattern: getPattern(current), kind: current.kind },
      allowlist,
    );

    setQueue((prev) => prev.slice(1));

    return {
      allowed: result.allowThis,
      remembered: result.rememberSession,
    };
  }, [current]);

  return {
    queue,
    current,
    enqueue,
    decide,
    getAllowlist: () => allowlist,
    autoRun,
    setAutoRun,
  };
}

function getPattern(req: ApprovalRequest): string {
  if (req.detail.type === "shell") return req.detail.command;
  if (req.detail.type === "mcp") return `${req.detail.server}:${req.detail.tool}`;
  return req.detail.path;
}
