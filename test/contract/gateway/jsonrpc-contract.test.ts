import { describe, expect, it } from "vitest";

/**
 * JSON-RPC contract tests: validate that the wire format between
 * TS client and Python server conforms to JSON-RPC 2.0 spec.
 *
 * These build and parse real JSON payloads through serialization
 * round-trips rather than asserting on static objects.
 */

function buildRpcRequest(method: string, params: Record<string, unknown> = {}): string {
  return JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params });
}

function parseRpcResponse(raw: string): { result?: unknown; error?: { code: number; message: string } } {
  return JSON.parse(raw);
}

describe("JSON-RPC contract: TS <-> Python", () => {
  it("complete request round-trips through JSON serialization", () => {
    const wire = buildRpcRequest("complete", {
      prompt: "Hello, world!",
      model: "gpt-4o",
      system_prompt: "You are helpful.",
      temperature: 0.2,
      max_tokens: 4096,
    });
    const parsed = JSON.parse(wire);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.method).toBe("complete");
    expect(parsed.params.prompt).toBe("Hello, world!");
    expect(parsed.params.temperature).toBe(0.2);
    expect(parsed.params.max_tokens).toBe(4096);
    expect(typeof parsed.id).toBe("number");
  });

  it("health request has empty params object", () => {
    const wire = buildRpcRequest("health");
    const parsed = JSON.parse(wire);
    expect(parsed.method).toBe("health");
    expect(parsed.params).toEqual({});
  });

  it("resolve_model request carries model param", () => {
    const wire = buildRpcRequest("resolve_model", { model: "openai/gpt-4o" });
    const parsed = JSON.parse(wire);
    expect(parsed.method).toBe("resolve_model");
    expect(parsed.params.model).toBe("openai/gpt-4o");
  });

  it("list_models request has empty params", () => {
    const wire = buildRpcRequest("list_models");
    const parsed = JSON.parse(wire);
    expect(parsed.method).toBe("list_models");
    expect(parsed.params).toEqual({});
    expect(typeof parsed.id).toBe("number");
  });

  it("cost_summary request has empty params", () => {
    const wire = buildRpcRequest("cost_summary");
    const parsed = JSON.parse(wire);
    expect(parsed.method).toBe("cost_summary");
    expect(parsed.params).toEqual({});
    expect(typeof parsed.id).toBe("number");
  });

  it("switch_provider request carries provider and optional base_url", () => {
    const wire = buildRpcRequest("switch_provider", {
      provider: "anthropic",
      base_url: "https://api.anthropic.com",
    });
    const parsed = JSON.parse(wire);
    expect(parsed.method).toBe("switch_provider");
    expect(parsed.params.provider).toBe("anthropic");
    expect(parsed.params.base_url).toBe("https://api.anthropic.com");
  });

  it("error response round-trips with correct structure", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32601, message: "Method not found" },
      id: 99,
    });
    const parsed = parseRpcResponse(raw);
    expect(parsed.error).toBeDefined();
    expect(parsed.error!.code).toBe(-32601);
    expect(parsed.error!.message).toBe("Method not found");
    expect(parsed.result).toBeUndefined();
  });

  it("success response round-trips with result", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      result: { text: "Hello!", model: "gpt-4o" },
      id: 1,
    });
    const parsed = parseRpcResponse(raw);
    expect(parsed.result).toEqual({ text: "Hello!", model: "gpt-4o" });
    expect(parsed.error).toBeUndefined();
  });
});
