import { describe, expect, it } from "vitest";
import { agentTomlSchema, policyYamlSchema } from "@kirakira/core";

describe("agentTomlSchema", () => {
  it("accepts full fixture shape and preserves values", () => {
    const raw = {
      schema_version: 1,
      workspace_name: "test-workspace",
      trust: "trusted",
      model: { default: "gpt-4o-mini", fallback: "gpt-4o-mini" },
      output: { default: "human", exec_default: "json" },
      approvals: { mode: "ask" },
      skills: { discover: [".kirakira/skills"] },
      compat: { read_claude: true, read_cursor: true },
    };
    const r = agentTomlSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.workspace_name).toBe("test-workspace");
      expect(r.data.model?.default).toBe("gpt-4o-mini");
      expect(r.data.model?.fallback).toBe("gpt-4o-mini");
      expect(r.data.trust).toBe("trusted");
      expect(r.data.skills?.discover).toEqual([".kirakira/skills"]);
    }
  });

  it("rejects invalid trust enum", () => {
    const r = agentTomlSchema.safeParse({
      schema_version: 1,
      trust: "nope",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing schema_version", () => {
    const r = agentTomlSchema.safeParse({ workspace_name: "x" });
    expect(r.success).toBe(false);
  });
});

describe("policyYamlSchema", () => {
  it("accepts fixture-like policy and preserves values", () => {
    const raw = {
      schemaVersion: 1,
      workspaceTrust: "trusted",
      shell: {
        hostExecution: "deny",
        allowlist: ["git:*", "pytest:*"],
        denylist: ["rm:*", "sudo:*"],
      },
      mcp: { allowRemoteHttp: true, allowLegacySse: "ask" },
      privacy: { redactEnv: ["OPENAI_API_KEY", "GITHUB_TOKEN"] },
    };
    const r = policyYamlSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.workspaceTrust).toBe("trusted");
      expect(r.data.shell?.hostExecution).toBe("deny");
      expect(r.data.shell?.allowlist).toEqual(["git:*", "pytest:*"]);
      expect(r.data.privacy?.redactEnv).toEqual(["OPENAI_API_KEY", "GITHUB_TOKEN"]);
    }
  });

  it("rejects bad schemaVersion type", () => {
    const r = policyYamlSchema.safeParse({
      schemaVersion: "1",
    });
    expect(r.success).toBe(false);
  });

  it("accepts policy with registry, model, and filesystem blocks", () => {
    const raw = {
      schemaVersion: 1,
      registry: {
        allowed_sources: ["https://internal.example.com"],
        require_provenance: true,
        require_signature: false,
      },
      model: {
        allowed_providers: ["openai", "anthropic"],
        denied_models: ["gpt-3.5-turbo"],
      },
      filesystem: {
        allowWrite: "ask",
        allowScripts: "deny",
        allowBrowser: "deny",
        allowExternalHttp: "ask",
      },
      mcp: {
        readonlyTools: ["read_file", "search"],
      },
    };
    const r = policyYamlSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.registry?.require_provenance).toBe(true);
      expect(r.data.model?.denied_models).toEqual(["gpt-3.5-turbo"]);
      expect(r.data.filesystem?.allowBrowser).toBe("deny");
      expect(r.data.mcp?.readonlyTools).toEqual(["read_file", "search"]);
    }
  });
});
