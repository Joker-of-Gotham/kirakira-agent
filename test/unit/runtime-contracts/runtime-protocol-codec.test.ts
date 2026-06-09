import { describe, expect, it, vi } from "vitest";
import {
  RuntimeRequestTracker,
  makeRuntimeProtocolError,
  parseRuntimeClientMessage,
  parseRuntimeServerMessage,
} from "../../../packages/runtime-contracts/src/index.js";

describe("runtime protocol codec", () => {
  it("validates client messages semantically and preserves request ids on errors", () => {
    expect(
      parseRuntimeClientMessage({
        type: "control",
        messageId: "submit-1",
        message: { type: "submit", prompt: "Map runtime", mode: "headless" },
      }),
    ).toMatchObject({ ok: true });

    expect(
      parseRuntimeClientMessage({
        type: "control",
        messageId: "bad-1",
        message: { type: "inspect" },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_control",
        message: "control message is malformed or unsupported",
        messageId: "bad-1",
        details: { type: "inspect" },
      },
    });

    expect(
      parseRuntimeClientMessage({
        type: "subscribe",
        messageId: "sub-1",
        runId: "run-1",
        filter: { kinds: ["not.real"] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_filter", messageId: "sub-1" },
    });

    expect(
      parseRuntimeClientMessage({
        type: "get_status",
        messageId: "status-1",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_message", messageId: "status-1" },
    });
  });

  it("validates server messages and builds correlated protocol errors", () => {
    expect(parseRuntimeServerMessage({ type: "ack" })).toBeNull();
    expect(
      parseRuntimeServerMessage({
        type: "error",
        code: "unknown_run",
        message: "Run not found",
        messageId: "state-1",
      }),
    ).toEqual({
      type: "error",
      code: "unknown_run",
      message: "Run not found",
      messageId: "state-1",
    });

    expect(
      makeRuntimeProtocolError({
        code: "invalid_control",
        message: "Bad control",
        messageId: "bad-1",
      }),
    ).toEqual({
      type: "error",
      code: "invalid_control",
      message: "Bad control",
      messageId: "bad-1",
    });
  });
});

describe("RuntimeRequestTracker", () => {
  it("rejects only the matching request for correlated errors", async () => {
    const tracker = new RuntimeRequestTracker({ timeoutMs: 10_000 });
    const first = tracker.track("msg-1", "first");
    const second = tracker.track("msg-2", "second");

    expect(
      tracker.handleServerMessage({
        type: "error",
        code: "unknown_run",
        message: "Missing run",
        messageId: "msg-1",
      }),
    ).toBe(true);
    expect(tracker.handleServerMessage({ type: "ack", messageId: "msg-2" })).toBe(true);

    await expect(first).rejects.toThrow("Missing run");
    await expect(second).resolves.toBeUndefined();
  });

  it("keeps pending requests alive for uncorrelated errors and rejects all on close", async () => {
    vi.useFakeTimers();
    const tracker = new RuntimeRequestTracker({ timeoutMs: 1_000 });
    const first = tracker.track("msg-1", "first");

    expect(
      tracker.handleServerMessage({
        type: "error",
        code: "daemon_warning",
        message: "Uncorrelated",
      }),
    ).toBe(false);
    expect(tracker.size).toBe(1);

    tracker.rejectAll(new Error("closed"));
    await expect(first).rejects.toThrow("closed");
    vi.useRealTimers();
  });
});
