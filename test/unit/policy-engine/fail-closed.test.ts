import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PolicyInput } from "@kirakira/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LedgerAuditWriter,
  ObligationExecutor,
  ProfileRegistry,
  SandboxManager,
  ShellPep,
  getFailClosedDecision,
  type ObligationHandler,
  type PdpClient,
  type PepContext,
} from "@kirakira/policy-engine";

const approvalPass: ObligationHandler = {
  type: "approval",
  async execute() {
    return { type: "approval", fulfilled: true };
  },
};

function minimalExecutor(profileReg: ProfileRegistry): ObligationExecutor {
  const ex = new ObligationExecutor();
  const sm = new SandboxManager(profileReg);
  ex.register({
    type: "sandbox",
    async execute(oblig, ctx) {
      await sm.switchProfile(oblig.profile ?? "read-only", ctx.decision);
      return { type: "sandbox", fulfilled: true };
    },
  });
  ex.register(approvalPass);
  return ex;
}

function failClosedShellPdp(): PdpClient {
  return {
    async evaluate(input: PolicyInput) {
      const d = getFailClosedDecision("pdp_unavailable", input.action.kind);
      return { ...d, request_id: input.request_id };
    },
    async health() {
      return { status: "unavailable", mode: "embedded" };
    },
    async close() {},
  };
}

describe("getFailClosedDecision integration", () => {
  let workspaceRoot: string;
  let tempAuditDir: string;
  let context: PepContext;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-fc-"));
    tempAuditDir = await mkdtemp(join(tmpdir(), "kirakira-test-audit-"));
    context = {
      sessionId: "s-fc",
      traceId: "t-fc",
      userId: "u-fc",
      workspaceRoot,
      interactive: false,
      roles: [],
    };
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tempAuditDir, { recursive: true, force: true });
  });

  it("delegates degraded allow + sandbox obligations for kinds outside PDP_BLOCKED_KINDS (model.invoke)", () => {
    const d = getFailClosedDecision("pdp_unavailable", "model.invoke");
    expect(d.effect).toBe("allow");
    expect(d.reason_codes).toContain("degraded_sandbox_lift");
    expect(d.obligations.some((o) => o.type === "sandbox" && o.profile === "read-only")).toBe(true);
  });

  it("denies high-risk shells when PDP is unreachable", async () => {
    const reg = new ProfileRegistry();
    reg.registerBuiltinProfiles();
    const pep = new ShellPep(failClosedShellPdp(), minimalExecutor(reg), new LedgerAuditWriter(tempAuditDir));
    const res = await pep.enforce({ command: "ls" }, context);
    expect(res.allowed).toBe(false);
    expect(res.decision.effect).toBe("deny");
  });

  it("denies escalation-sensitive kinds when approval manager is unavailable", () => {
    const dShell = getFailClosedDecision("approval_unavailable", "shell.exec");
    expect(dShell.effect).toBe("deny");
    expect(dShell.reason_codes).toContain("approval_unavailable");
  });

  it("hard-stops shells when audit write fails for high-touch kinds", () => {
    const dShell = getFailClosedDecision("audit_write_failed", "shell.exec");
    expect(dShell.effect).toBe("deny");
    expect(dShell.reason_codes.join(" ").toLowerCase()).toMatch(/audit/i);
    const low = getFailClosedDecision("audit_write_failed", "model.invoke");
    expect(low.effect).toBe("allow");
  });
});
