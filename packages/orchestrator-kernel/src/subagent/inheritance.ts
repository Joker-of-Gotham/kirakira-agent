import type { WorkerConfig } from "@kirakira/agent-runtime";
import { ulid } from "ulid";
import { OrchestratorKernelError } from "../errors.js";
import type { SubagentSpec } from "../types.js";

function clampCeiling(
  parent: WorkerConfig["policyCeiling"] | undefined,
  requested: WorkerConfig["policyCeiling"] | undefined,
): WorkerConfig["policyCeiling"] | undefined {
  if (!requested) return parent;
  if (!parent) return requested;
  const rankNet = (n: string | undefined): number => {
    if (n === "none") return 0;
    if (n === "restricted") return 1;
    return 2;
  };
  const rankFs = (f: string | undefined): number => {
    if (f === "deny") return 0;
    if (f === "ask") return 1;
    return 2;
  };
  const rankSh = (s: string | undefined): number => {
    if (s === "deny") return 0;
    if (s === "ask") return 1;
    return 2;
  };
  const nets = ["none", "restricted", "full"] as const;
  const fss = ["deny", "ask", "allow"] as const;
  const shs = ["deny", "ask", "allow"] as const;
  const out: {
    network?: (typeof nets)[number];
    filesystemWrite?: (typeof fss)[number];
    shell?: (typeof shs)[number];
  } = {};
  if (requested.network !== undefined || parent.network !== undefined) {
    const pn = parent.network ?? "none";
    const rn = requested.network ?? pn;
    out.network = nets[Math.min(rankNet(pn), rankNet(rn))]!;
  }
  if (requested.filesystemWrite !== undefined || parent.filesystemWrite !== undefined) {
    const pf = parent.filesystemWrite ?? "deny";
    const rf = requested.filesystemWrite ?? pf;
    out.filesystemWrite = fss[Math.min(rankFs(pf), rankFs(rf))]!;
  }
  if (requested.shell !== undefined || parent.shell !== undefined) {
    const ps = parent.shell ?? "deny";
    const rs = requested.shell ?? ps;
    out.shell = shs[Math.min(rankSh(ps), rankSh(rs))]!;
  }
  return Object.keys(out).length > 0 ? (out as NonNullable<WorkerConfig["policyCeiling"]>) : undefined;
}

export function inheritFromParent(parentConfig: WorkerConfig, childSpec: SubagentSpec): WorkerConfig {
  const ceiling = clampCeiling(parentConfig.policyCeiling, childSpec.policyCeiling);
  return {
    workerId: ulid(),
    workspaceRoot: parentConfig.workspaceRoot,
    sandboxProfileId: parentConfig.sandboxProfileId,
    ...(parentConfig.traceId !== undefined ? { traceId: parentConfig.traceId } : {}),
    ...(parentConfig.spanId !== undefined ? { spanId: parentConfig.spanId } : {}),
    runId: childSpec.runId,
    parentWorkerId: parentConfig.workerId,
    ...(parentConfig.modelDefault !== undefined ? { modelDefault: parentConfig.modelDefault } : {}),
    allowedToolNames: childSpec.capabilities.filter((c) => c.kind === "tool").map((c) => c.name),
    mcpServerAllowlist: childSpec.capabilities.filter((c) => c.kind === "mcp").map((c) => c.name),
    skillAllowlist: childSpec.capabilities.filter((c) => c.kind === "skill").map((c) => c.name),
    ...(ceiling !== undefined && Object.keys(ceiling).length > 0 ? { policyCeiling: ceiling } : {}),
  };
}

export function assertWithinParentPolicy(
  childCeiling: WorkerConfig["policyCeiling"],
  parentCeiling: WorkerConfig["policyCeiling"],
): void {
  if (!childCeiling || !parentCeiling) return;
  const rankNet = (n: string | undefined): number => {
    if (n === "none") return 0;
    if (n === "restricted") return 1;
    return 2;
  };
  const cNet = childCeiling.network;
  const pNet = parentCeiling.network;
  if (cNet && pNet && rankNet(cNet) > rankNet(pNet)) {
    throw new OrchestratorKernelError("POLICY_CEILING", "Child network policy exceeds parent ceiling");
  }
  const rankFs = (f: string | undefined): number => {
    if (f === "deny") return 0;
    if (f === "ask") return 1;
    return 2;
  };
  const cFs = childCeiling.filesystemWrite;
  const pFs = parentCeiling.filesystemWrite;
  if (cFs && pFs && rankFs(cFs) > rankFs(pFs)) {
    throw new OrchestratorKernelError(
      "POLICY_CEILING",
      "Child filesystem write policy exceeds parent ceiling",
    );
  }
  const rankShell = (s: string | undefined): number => {
    if (s === "deny") return 0;
    if (s === "ask") return 1;
    return 2;
  };
  const cShell = childCeiling.shell;
  const pShell = parentCeiling.shell;
  if (cShell && pShell && rankShell(cShell) > rankShell(pShell)) {
    throw new OrchestratorKernelError("POLICY_CEILING", "Child shell policy exceeds parent ceiling");
  }
}
