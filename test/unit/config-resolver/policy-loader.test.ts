import { describe, expect, it } from "vitest";
import { matchShellPolicy, matchMcpServerPolicy } from "../../../packages/config-resolver/src/policy-loader.js";
import type { PolicyYaml } from "../../../packages/config-resolver/src/types.js";

describe("matchShellPolicy", () => {
  const policy: PolicyYaml = {
    schemaVersion: 1,
    shell: {
      hostExecution: "deny",
      allowlist: ["git:*", "npm:*", "pytest:*"],
      denylist: ["rm:*", "sudo:*"],
    },
  };

  it("returns deny for denylist matches", () => {
    expect(matchShellPolicy("rm -rf /", policy)).toBe("deny");
    expect(matchShellPolicy("sudo apt install", policy)).toBe("deny");
  });

  it("returns allow for allowlist matches", () => {
    expect(matchShellPolicy("git status", policy)).toBe("allow");
    expect(matchShellPolicy("npm install", policy)).toBe("allow");
  });

  it("returns hostExecution default for unmatched commands", () => {
    expect(matchShellPolicy("curl https://example.com", policy)).toBe("deny");
  });

  it("returns ask when no policy provided", () => {
    expect(matchShellPolicy("anything", undefined)).toBe("ask");
  });

  it("denylist takes priority over allowlist", () => {
    const p: PolicyYaml = {
      schemaVersion: 1,
      shell: {
        allowlist: ["rm:*"],
        denylist: ["rm:*"],
      },
    };
    expect(matchShellPolicy("rm test", p)).toBe("deny");
  });
});

describe("matchMcpServerPolicy", () => {
  const policy: PolicyYaml = {
    schemaVersion: 1,
    mcp: {
      approvedServers: ["trusted-server"],
      deniedServers: ["malicious-server"],
    },
  };

  it("returns allow for approved servers", () => {
    expect(matchMcpServerPolicy("trusted-server", policy)).toBe("allow");
  });

  it("returns deny for denied servers", () => {
    expect(matchMcpServerPolicy("malicious-server", policy)).toBe("deny");
  });

  it("returns ask for unknown servers", () => {
    expect(matchMcpServerPolicy("unknown-server", policy)).toBe("ask");
  });

  it("returns ask when no policy provided", () => {
    expect(matchMcpServerPolicy("any", undefined)).toBe("ask");
  });
});
