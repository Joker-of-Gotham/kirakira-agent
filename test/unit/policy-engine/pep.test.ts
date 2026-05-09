import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PolicyInput } from "@kirakira/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  EmbeddedPdp,
  FilePep,
  LedgerAuditWriter,
  McpPep,
  ObligationExecutor,
  type ObligationHandler,
  PepRegistry,
  ShellPep,
  ProfileRegistry,
  SandboxManager,
  type PdpClient,
  type PepContext,
  normalizeShellCommand,
  normalizeAction,
  type RawAction,
} from "@kirakira/policy-engine";

class CaptureInputPdp implements PdpClient {
  lastInput?: PolicyInput;
  constructor(private readonly inner: EmbeddedPdp) {}

  evaluate(input: PolicyInput) {
    this.lastInput = input;
    return this.inner.evaluate(input);
  }

  health() {
    return this.inner.health();
  }

  close() {
    return this.inner.close();
  }
}

const noopApproval: ObligationHandler = {
  type: "approval",
  async execute() {
    return { type: "approval", fulfilled: true };
  },
};

function makeExecutor(reg: ProfileRegistry): ObligationExecutor {
  const ex = new ObligationExecutor();
  const sm = new SandboxManager(reg);
  ex.register({
    type: "sandbox",
    async execute(ob, ctx) {
      await sm.switchProfile(ob.profile ?? "plan-only", ctx.decision);
      return { type: "sandbox", fulfilled: true };
    },
  });
  ex.register(noopApproval);
  return ex;
}

describe("PEP registry and policy inputs", () => {
  let workspaceRoot: string;
  let tempAuditDir: string;
  let context: PepContext;
  let registry: ProfileRegistry;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-pep-"));
    tempAuditDir = await mkdtemp(join(tmpdir(), "kirakira-test-audit-"));
    registry = new ProfileRegistry();
    registry.registerBuiltinProfiles();
    context = {
      sessionId: "s-pep",
      traceId: "t-pep",
      userId: "u-pep",
      workspaceRoot,
      interactive: true,
      roles: [],
    };
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tempAuditDir, { recursive: true, force: true });
  });

  it("ShellPep builds correct PolicyInput envelope for shell.exec", async () => {
    const embedded = new EmbeddedPdp(join(workspaceRoot, "b.json"));
    const cap = new CaptureInputPdp(embedded);
    const pep = new ShellPep(cap, makeExecutor(registry), new LedgerAuditWriter(tempAuditDir));
    const cmd = "ls";
    await pep.enforce({ command: cmd }, context);
    const raw: RawAction = {
      kind: "shell.exec",
      toolType: "shell",
      toolName: "shell",
      operation: "exec",
      command: cmd,
      workspaceRoot,
    };
    expect(cap.lastInput!.action.kind).toBe("shell.exec");
    expect(cap.lastInput!.action.normalized).toMatchObject(normalizeAction(raw));
    expect(cap.lastInput!.principal.user_id).toBe(context.userId);
    await embedded.close();
  });

  it("FilePep blocks writes targeting paths outside the workspace root", async () => {
    const embedded = new EmbeddedPdp(join(workspaceRoot, "b.json"));
    const pep = new FilePep(embedded, makeExecutor(registry), new LedgerAuditWriter(tempAuditDir));
    const res = await pep.enforce(
      { path: "/etc/hosts", operation: "write" },
      context,
    );
    expect(res.allowed).toBe(false);
    expect(res.decision.effect).toBe("deny");
    expect(res.decision.reason_codes.some((r) => r.includes("pep_normalization_blocked"))).toBe(true);
    await embedded.close();
  });

  it("McpPep sets tool_type mcp on the constructed PolicyInput action", async () => {
    const embedded = new EmbeddedPdp(join(workspaceRoot, "b.json"));
    const cap = new CaptureInputPdp(embedded);
    const pep = new McpPep(cap, makeExecutor(registry), new LedgerAuditWriter(tempAuditDir));
    await pep.enforce(
      { server: "demo.mcp.local", tool: "resources.read_text", operation: "resources.read_text" },
      context,
    );
    expect(cap.lastInput!.action.tool_type).toBe("mcp");
    await embedded.close();
  });

  it("PepRegistry dispatches enforcement to the registered PEP implementation", async () => {
    const embedded = new EmbeddedPdp(join(workspaceRoot, "b.json"));
    const cap = new CaptureInputPdp(embedded);
    const shell = new ShellPep(cap, makeExecutor(registry), new LedgerAuditWriter(tempAuditDir));
    const reg = new PepRegistry();
    reg.register("shell.exec", shell);
    await reg.enforce("shell.exec", { command: "echo hello" }, context);
    expect(cap.lastInput).toBeDefined();
    expect(cap.lastInput!.action.kind).toBe("shell.exec");
    await embedded.close();
  });
});
