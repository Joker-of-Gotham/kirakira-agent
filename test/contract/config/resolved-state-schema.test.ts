import { describe, expect, it } from "vitest";
import { agentTomlSchema, policyYamlSchema } from "../../../packages/core/src/schemas/config.js";

describe("resolved state schema stability", () => {
  it("agentTomlSchema accepts all required fields", () => {
    const full = {
      schema_version: 1,
      workspace_name: "test",
      trust: "ask",
      model: {
        default: "gpt-4o",
        fallback: "gpt-4o-mini",
        providers: [
          {
            name: "primary",
            type: "openai",
            base_url: "https://api.openai.com/v1",
            api_key_env: "OPENAI_API_KEY",
          },
        ],
        max_cost_per_session_usd: 10.0,
      },
      registry: {
        sources: [{ name: "default", url: "https://registry.kirakira.dev", type: "kirakira" }],
        default_source: "default",
        install_scope: "workspace",
      },
      orchestration: {
        handoff_mode: "tool",
        max_concurrency: 4,
        default_subagent_turns: 32,
        subagent_system_preamble: "Stay scoped.",
        subagent_context: "filtered",
        trace_handoffs: true,
        topology: {
          mode: "swarm",
          default_role: "supervisor",
          lanes: {
            foreground: { capacity: 2 },
            delegated: { capacity: 4 },
          },
          roles: [
            {
              id: "supervisor",
              lane: "foreground",
              context: "filtered",
              permissions: ["plan", "delegate"],
            },
            {
              id: "implementer",
              lane: "delegated",
              context: "isolated",
              mcp_servers: ["filesystem-patch"],
            },
          ],
          handoffs: [
            {
              from: "supervisor",
              to: "implementer",
              mode: "tool",
              input_filter: "scoped-task-brief",
              conditions: ["bounded-write-set"],
            },
          ],
        },
      },
      deep_research: {
        enabled: true,
        max_depth: 3,
        max_breadth: 4,
        max_tool_calls: 24,
        require_citations: true,
        source_policy: "hybrid",
        workspace_dir: ".kirakira/research",
      },
      runtime: {
        default_profile: "container",
        profiles: [
          {
            name: "container",
            mode: "container",
            compose_profiles: ["cli"],
            env_files: [".env"],
            workspace_root_env: "KIRAKIRA_WORKSPACE_ROOT",
            services: [{ name: "postgres", url_env: "DATABASE_URL", required: true }],
          },
        ],
      },
      presentation: {
        web: {
          enabled: true,
          dev_url_env: "KIRAKIRA_WEB_URL",
          api_base_url_env: "KIRAKIRA_API_BASE_URL",
        },
        desktop: {
          enabled: true,
          web_url_env: "KIRAKIRA_WEB_URL",
          preload_contract: "strict-ipc",
        },
      },
      features: {
        tool_search: true,
        lazy_schema_injection: true,
        progressive_skill_loading: false,
        cost_tracking: true,
      },
    };
    const result = agentTomlSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("agentTomlSchema is backward compatible with v1 format", () => {
    const v1 = {
      schema_version: 1,
      model: { default: "gpt-4o" },
      telemetry: { mode: "off" },
    };
    const result = agentTomlSchema.safeParse(v1);
    expect(result.success).toBe(true);
  });

  it("policyYamlSchema accepts budget and network fields", () => {
    const policy = {
      schemaVersion: 1,
      budget: {
        max_cost_per_session_usd: 5.0,
        max_cost_per_day_usd: 50.0,
        alert_threshold_pct: 90,
      },
      network: {
        allowed_domains: ["api.openai.com"],
        denied_domains: ["malicious.com"],
      },
    };
    const result = policyYamlSchema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it("policyYamlSchema is backward compatible", () => {
    const v1 = {
      schemaVersion: 1,
      shell: { hostExecution: "deny" },
      privacy: { redactEnv: ["SECRET"] },
    };
    const result = policyYamlSchema.safeParse(v1);
    expect(result.success).toBe(true);
  });
});
