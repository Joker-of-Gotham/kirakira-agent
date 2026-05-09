import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  computeFingerprint,
  stripEphemeralFields,
} from "@kirakira/policy-engine";

describe("computeFingerprint", () => {
  it("maps equivalent structural features to the same template fingerprint", () => {
    const base = {
      tool_type: "shell",
      command_base: "ls",
      write_paths: [] as string[],
      read_paths: ["./a", "./b"] as string[],
    };
    const a = computeFingerprint({ ...base });
    const b = computeFingerprint({ ...base, read_paths: ["./b", "./a"] });
    expect(a.exact).toBe(b.exact);
    expect(a.template).toBe(b.template);
  });

  it("produces distinct exact fingerprints when arguments differ materially", () => {
    const a = computeFingerprint({ tool_type: "shell", command_base: "ls", read_paths: ["x"] });
    const b = computeFingerprint({ tool_type: "shell", command_base: "cat", read_paths: ["x"] });
    expect(a.exact).not.toBe(b.exact);
    expect(a.template).not.toBe(b.template);
  });

  it("strips ephemeral field names via stripEphemeralFields", () => {
    const trimmed = stripEphemeralFields({
      trace_id: "ignored",
      request_id: "ignored",
      tool_type: "shell",
      command_base: "ls",
      nested: {
        timestamp: "t",
        keep: true,
      },
    } as Record<string, unknown>);
    expect(trimmed.trace_id).toBeUndefined();
    expect(trimmed.request_id).toBeUndefined();
    expect(trimmed.timestamp).toBeUndefined();
    expect(trimmed.command_base).toBe("ls");
    expect(trimmed.tool_type).toBe("shell");
    expect(trimmed.nested).toEqual({ keep: true });
  });

  it("canonicalJson sorts keys lexicographically for deterministic payloads", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
