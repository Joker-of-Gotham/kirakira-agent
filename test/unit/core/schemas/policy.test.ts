import { describe, expect, it } from "vitest";
import {
  policyInputSchema,
  airiskOutputSchema,
  policyDecisionSchema,
  approvalRecordSchema,
  sandboxProfileSchema,
  obligationSchema,
} from "@kirakira/core";

describe("policyInputSchema", () => {
  it("accepts a complete shell.exec policy input", () => {
    const raw = {
      request_id: "req-shell-8842",
      session_id: "sess-7f3c9a01",
      trace_id: "trace-a1b2c3d4",
      timestamp: "2026-05-04T12:00:00.000Z",
      principal: {
        user_id: "principal-alex",
        org_id: "org-acme",
        roles: ["developer", "codeowner"],
        groups: ["platform-eng"],
        authn_method: "sso",
        device_trust: "managed",
        interactive: true,
      },
      workspace: {
        workspace_id: "ws-financial-graph-main",
        root: "/repo/260503_FG_Construct_V4",
        vcs: {
          provider: "github",
          branch: "feat/policy-pipeline",
          dirty: false,
        },
        labels: {
          data_classification: "confidential-financial",
          repo_trust: "internal-verified",
        },
      },
      action: {
        kind: "shell.exec",
        tool_type: "shell",
        tool_name: "bash",
        operation: "run",
        raw: {
          command: "pnpm exec vitest run test/unit/core/schemas/policy.test.ts",
          args: ["run", "test/unit/core/schemas/policy.test.ts"],
          env: { CI: "1", NODE_ENV: "test" },
        },
        normalized: {
          command_ast_hash: "sha256:01ba4719c80b6fe911bab0910747a045",
          command_base: "pnpm",
          flags: ["exec"],
          subcommands: ["vitest"],
          write_paths: ["/repo/260503_FG_Construct_V4/coverage/", "/tmp/vite-cache/"],
          read_paths: ["/repo/260503_FG_Construct_V4/package.json"],
          network: {
            required: false,
            domains: [],
          },
          destructive: false,
          interpreter_handoff: false,
          pipeline_depth: 0,
          redirection_targets: [],
        },
      },
      target: {
        resource_type: "workspace.filesystem",
        resources: [
          {
            id: "path:coverage/",
            owner: "build-agent",
            classification: "derived_test_artifact",
          },
        ],
      },
      context: {
        source: "kirakira.cli",
        invoker: "kirakira-agent@v0.1.0",
        subagent_id: "sub-codegen-002",
        prior_decisions: {
          fingerprint_hit: false,
          approval_template_hit: true,
        },
      },
      risk: {
        interpreter_summary: "Runs project unit tests via pnpm; may spawn child processes",
        signals: ["subprocess", "filesystem_write_coverage"],
      },
    };
    const r = policyInputSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.version).toBe("kirakira.policyinput.v1");
      expect(r.data.action.kind).toBe("shell.exec");
      expect(r.data.action.normalized?.write_paths).toContain(
        "/repo/260503_FG_Construct_V4/coverage/",
      );
    }
  });

  it("accepts a minimal policy input without optional fields", () => {
    const raw = {
      request_id: "req-min-1",
      session_id: "sess-min-1",
      trace_id: "trace-min-1",
      timestamp: "2026-05-04T12:00:00.000Z",
      principal: {
        user_id: "user-min",
        roles: ["viewer"],
        authn_method: "token",
        device_trust: "unknown",
        interactive: false,
      },
      workspace: {
        workspace_id: "ws-min",
        root: "/tmp/kirakira-ws",
      },
      action: {
        kind: "file.write",
        tool_type: "file",
        tool_name: "workspace-fs",
        operation: "write",
      },
    };
    const r = policyInputSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.version).toBe("kirakira.policyinput.v1");
      expect(r.data.target).toBeUndefined();
      expect(r.data.context).toBeUndefined();
      expect(r.data.risk).toBeUndefined();
    }
  });

  it("rejects invalid action kind", () => {
    const base = {
      request_id: "r1",
      session_id: "s1",
      trace_id: "t1",
      timestamp: "2026-05-04T12:00:00.000Z",
      principal: {
        user_id: "u1",
        roles: [],
        authn_method: "api_key",
        device_trust: "unmanaged",
        interactive: true,
      },
      workspace: { workspace_id: "w1", root: "/" },
      action: {
        kind: "shell.exec",
        tool_type: "shell",
        tool_name: "sh",
        operation: "run",
      },
    };
    const r = policyInputSchema.safeParse({
      ...base,
      action: { ...base.action, kind: "invalid" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid tool type", () => {
    const base = {
      request_id: "r1",
      session_id: "s1",
      trace_id: "t1",
      timestamp: "2026-05-04T12:00:00.000Z",
      principal: {
        user_id: "u1",
        roles: [],
        authn_method: "api_key",
        device_trust: "unmanaged",
        interactive: false,
      },
      workspace: { workspace_id: "w1", root: "/" },
      action: {
        kind: "tool.call",
        tool_type: "mcp",
        tool_name: "x",
        operation: "invoke",
      },
    };
    const r = policyInputSchema.safeParse({
      ...base,
      action: { ...base.action, tool_type: "bad" },
    });
    expect(r.success).toBe(false);
  });

  it("preserves normalized action fields", () => {
    const raw = {
      request_id: "req-norm",
      session_id: "sess-norm",
      trace_id: "trace-norm",
      timestamp: "2026-05-04T12:00:00.000Z",
      principal: {
        user_id: "u1",
        roles: [],
        authn_method: "sso",
        device_trust: "managed",
        interactive: true,
      },
      workspace: { workspace_id: "w1", root: "/proj" },
      action: {
        kind: "shell.exec",
        tool_type: "shell",
        tool_name: "zsh",
        operation: "run",
        normalized: {
          flags: [],
          subcommands: [],
          write_paths: ["/proj/out.log", "/proj/tmp/"],
          read_paths: [],
          destructive: true,
          interpreter_handoff: true,
          pipeline_depth: 3,
          redirection_targets: ["/proj/nohup.out"],
        },
      },
    };
    const r = policyInputSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success && r.data.action.normalized) {
      expect(r.data.action.normalized.write_paths).toEqual([
        "/proj/out.log",
        "/proj/tmp/",
      ]);
      expect(r.data.action.normalized.destructive).toBe(true);
      expect(r.data.action.normalized.interpreter_handoff).toBe(true);
      expect(r.data.action.normalized.pipeline_depth).toBe(3);
    }
  });

  it("accepts mcp tool call input", () => {
    const raw = {
      request_id: "req-mcp-99",
      session_id: "sess-mcp",
      trace_id: "trace-mcp",
      timestamp: "2026-05-04T12:30:00.000Z",
      principal: {
        user_id: "u-bot",
        roles: ["automations"],
        authn_method: "api_key",
        device_trust: "managed",
        interactive: false,
      },
      workspace: {
        workspace_id: "ws-ledger",
        root: "/srv/agents/workspace-01",
      },
      action: {
        kind: "tool.call",
        tool_type: "mcp",
        tool_name: "internal_search",
        operation: "query",
      },
      context: {
        mcp_server: {
          id: "mcp.corp.document-search",
          issuer: "https://auth.example.com/realms/agents",
          trust_tier: "tier-2-internal",
        },
      },
    };
    const r = policyInputSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.action.tool_type).toBe("mcp");
      expect(r.data.context?.mcp_server?.id).toBe("mcp.corp.document-search");
      expect(r.data.context?.mcp_server?.trust_tier).toBe("tier-2-internal");
    }
  });
});

describe("airiskOutputSchema", () => {
  it("accepts full AIRISK classification", () => {
    const raw = {
      version: "kirakira.airisk.v1",
      request_id: "req-airisk-complete",
      classification: {
        action_family: "shell.package_install",
        side_effect_level: "high",
        destructive: false,
        network_required: true,
        external_content_dependency: true,
        secret_exposure_risk: "medium",
        workspace_escape_risk: "high",
        supply_chain_risk: "high",
      },
      claims: [
        {
          code: "DEPENDENCY_RESOLUTION_NETWORK",
          severity: "critical",
          confidence: 0.991,
          evidence: [
            "invoke:npm ci",
            "network_host:registry.npmjs.org",
          ],
        },
        {
          code: "PACKAGE_INTEGRITY_UNVERIFIED",
          severity: "high",
          confidence: 0.42,
          evidence: ["missing:lockfile-signature"],
        },
      ],
      recommended_obligations: [
        "sandbox",
        "network_allowlist",
        "copyout_review",
        "approval",
      ],
      canonical_fingerprint_material: {
        action_family: "shell.package_install",
        write_paths: ["node_modules/", "package-lock.json"],
        network_domains: ["registry.npmjs.org"],
        tool_type: "shell",
      },
    };
    const r = airiskOutputSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.classification.supply_chain_risk).toBe("high");
      expect(r.data.claims).toHaveLength(2);
      expect(r.data.claims[0].confidence).toBe(0.991);
      expect(r.data.canonical_fingerprint_material?.network_domains).toContain(
        "registry.npmjs.org",
      );
    }
  });

  it("rejects claim confidence outside 0-1 range", () => {
    const raw = {
      request_id: "req-bad-conf",
      classification: {
        action_family: "x",
        side_effect_level: "none",
        destructive: false,
        network_required: false,
        external_content_dependency: false,
        secret_exposure_risk: "none",
        workspace_escape_risk: "none",
        supply_chain_risk: "none",
      },
      claims: [
        {
          code: "C1",
          severity: "low",
          confidence: 1.5,
          evidence: [],
        },
      ],
      recommended_obligations: [],
    };
    const r = airiskOutputSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });

  it("defaults version to kirakira.airisk.v1", () => {
    const raw = {
      request_id: "req-def-ver",
      classification: {
        action_family: "model.invoke.completion",
        side_effect_level: "low",
        destructive: false,
        network_required: true,
        external_content_dependency: false,
        secret_exposure_risk: "low",
        workspace_escape_risk: "none",
        supply_chain_risk: "low",
      },
      claims: [],
      recommended_obligations: [],
    };
    const r = airiskOutputSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.version).toBe("kirakira.airisk.v1");
    }
  });
});

describe("policyDecisionSchema", () => {
  it("accepts allow decision with obligations", () => {
    const raw = {
      decision_id: "dec-allow-sbx-001",
      request_id: "req-shell-8842",
      effect: "allow",
      reason_codes: [],
      policy: {
        bundle_id: "@enterprise/kirakira-shell-policy",
        revision: "2026.05.02+r42",
        package: "@enterprise/kirakira-shell-policy",
      },
      approval: {
        required: true,
        mode: "human",
        template_id: "tpl-high-impact-shell",
        cacheable: true,
        ttl_seconds: 86400,
      },
      obligations: [
        {
          type: "sandbox",
          profile: "workspace-write",
          required: true,
        },
        {
          type: "approval",
          scope: "workspace",
          required: true,
        },
      ],
      explain: {
        summary: "Execution permitted under hardened workspace-write sandbox pending human approval",
        matched_rules: [
          "SHELL_RULE_MANAGED_DEVICE",
          "SHELL_RULE_TRUSTED_WORKSPACE_LABEL",
        ],
      },
    };
    const r = policyDecisionSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.version).toBe("kirakira.decision.v1");
      expect(r.data.effect).toBe("allow");
      expect(r.data.obligations[0].type).toBe("sandbox");
      expect(r.data.obligations[1].type).toBe("approval");
    }
  });

  it("accepts deny decision with reason codes", () => {
    const raw = {
      decision_id: "dec-deny-net-771",
      request_id: "req-curl-unknown",
      effect: "deny",
      reason_codes: ["unauthorized_domain"],
      policy: {
        bundle_id: "@enterprise/kirakira-network-policy",
        revision: "1.8.0",
        package: "@enterprise/kirakira-defaults",
      },
      approval: {
        required: false,
        mode: "none",
        cacheable: false,
      },
      obligations: [{ type: "reason_required", min_length: 12 }],
      explain: {
        summary: "Outbound request target is not on the egress allowlist",
        matched_rules: ["NET_DENY_NON_ALLOWLIST_DOMAIN"],
      },
    };
    const r = policyDecisionSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.effect).toBe("deny");
      expect(r.data.reason_codes).toEqual(["unauthorized_domain"]);
    }
  });

  it("rejects invalid effect", () => {
    const raw = {
      decision_id: "dec-x",
      request_id: "req-x",
      effect: "maybe",
      reason_codes: [],
      policy: { bundle_id: "b", revision: "1", package: "p" },
      approval: { required: false, mode: "none", cacheable: false },
      obligations: [],
      explain: { summary: "", matched_rules: [] },
    };
    const r = policyDecisionSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });
});

describe("approvalRecordSchema", () => {
  it("accepts pending approval record", () => {
    const raw = {
      approval_id: "apr-pending-k9",
      status: "pending",
      scope: "once",
      requested_at: "2026-05-04T12:00:00.000Z",
      principal: {
        user_id: "user-alex",
        interactive: true,
      },
      decision_id: "dec-allow-sbx-001",
      fingerprint: {
        exact: "fp:sha256:exact-shell-npm-ci",
        template: "fp:tpl:npm-*:managed-device",
      },
      request_summary: {
        title: "Approve npm ci in financial-graph workspace",
        risk: "high — supply-chain and network egress",
        requested_permissions: [
          "shell.exec:npm",
          "network.registry.npmjs.org",
        ],
      },
    };
    const r = approvalRecordSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("pending");
      expect(r.data.resolution).toBeUndefined();
      expect(r.data.version).toBe("kirakira.approval.v1");
    }
  });

  it("accepts approved record with resolution", () => {
    const raw = {
      approval_id: "apr-done-441",
      status: "approved",
      scope: "session",
      requested_at: "2026-05-04T12:00:00.000Z",
      resolved_at: "2026-05-04T12:07:31.500Z",
      principal: {
        user_id: "user-alex",
        interactive: true,
      },
      decision_id: "dec-allow-sbx-001",
      fingerprint: {
        exact: "fp:sha256:exact-shell-npm-ci",
        template: "fp:tpl:npm-*:managed-device",
      },
      request_summary: {
        title: "npm ci for dependency refresh",
        risk: "high",
        requested_permissions: ["network", "filesystem:node_modules"],
      },
      resolution: {
        outcome: "approved",
        reviewer: "security-oncall",
        comment: "Approved for this release window only; rerun policy after merge.",
      },
    };
    const r = approvalRecordSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.resolution?.outcome).toBe("approved");
      expect(r.data.resolution?.comment).toContain("release window");
    }
  });
});

describe("sandboxProfileSchema", () => {
  it("accepts workspace-write profile", () => {
    const raw = {
      name: "workspace-write",
      platforms: ["linux", "macos"],
      filesystem: {
        root_mode: "workspace",
        read_only_mounts: ["/nix/store"],
        read_write_mounts: ["/workspace", "/workspace/.kirakira/cache"],
        deny_paths: ["/workspace/.env.production"],
      },
      network: {
        mode: "allowlist",
        domains: ["registry.npmjs.org", "api.openai.com"],
      },
      process: {
        seccomp: "default-deny",
        max_cpu_seconds: 900,
        max_memory_mb: 4096,
        allow_exec: ["/usr/bin/node", "/usr/bin/pnpm"],
      },
      secrets: {
        exposed: ["OPENAI_API_KEY", "NPM_TOKEN"],
      },
      egress_proxy: "https://proxy.corp.example.com:8443",
      copyout: {
        require_post_review: true,
      },
    };
    const r = sandboxProfileSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.version).toBe("kirakira.sandbox.v1");
      expect(r.data.network.mode).toBe("allowlist");
      expect(r.data.filesystem.root_mode).toBe("workspace");
    }
  });

  it("rejects invalid network mode", () => {
    const raw = {
      name: "broken-profile",
      platforms: ["linux"],
      filesystem: {
        root_mode: "workspace",
        read_only_mounts: [],
        read_write_mounts: ["/workspace"],
        deny_paths: [],
      },
      network: {
        mode: "invalid",
      },
      process: {
        seccomp: "permissive",
        max_cpu_seconds: 60,
        max_memory_mb: 512,
        allow_exec: [],
      },
      secrets: { exposed: [] },
      copyout: { require_post_review: false },
    };
    const r = sandboxProfileSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });
});

describe("obligationSchema", () => {
  it("accepts sandbox obligation with profile", () => {
    const raw = {
      type: "sandbox",
      profile: "read-only",
    };
    const r = obligationSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe("sandbox");
      expect(r.data.profile).toBe("read-only");
    }
  });

  it("accepts approval obligation with scope", () => {
    const raw = {
      type: "approval",
      scope: "session",
      channel: "slack://#kirakira-approvals",
      required: true,
    };
    const r = obligationSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe("approval");
      expect(r.data.scope).toBe("session");
    }
  });
});
