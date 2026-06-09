import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES,
  RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES,
  detectRuntimeArtifactContentEncoding,
  resolveRuntimeArtifactContentMaxBytes,
  runtimeArtifactContentLooksTextual,
} from "../../../packages/runtime-contracts/src/index.js";

describe("runtime artifact content contract", () => {
  it("resolves preview byte limits from the shared contract", () => {
    expect(resolveRuntimeArtifactContentMaxBytes(undefined)).toBe(
      DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES,
    );
    expect(resolveRuntimeArtifactContentMaxBytes(1)).toBe(1);
    expect(resolveRuntimeArtifactContentMaxBytes(0)).toBe(
      DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES,
    );
    expect(resolveRuntimeArtifactContentMaxBytes(RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES + 1))
      .toBe(RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES);
  });

  it("detects textual artifacts without depending on Node-only path helpers", () => {
    expect(runtimeArtifactContentLooksTextual({ kind: "json" })).toBe(true);
    expect(runtimeArtifactContentLooksTextual({ path: "reports/summary.md" })).toBe(true);
    expect(runtimeArtifactContentLooksTextual({ path: "reports\\summary.JSONL" })).toBe(true);
    expect(runtimeArtifactContentLooksTextual({ bytes: new Uint8Array([65, 66, 67]) })).toBe(
      true,
    );
    expect(runtimeArtifactContentLooksTextual({ bytes: new Uint8Array([0, 65, 66]) })).toBe(
      false,
    );
  });

  it("selects the public preview encoding from kind, path, and bytes", () => {
    expect(
      detectRuntimeArtifactContentEncoding({
        path: "patches/change.diff",
        bytes: new Uint8Array([0]),
      }),
    ).toBe("utf8");
    expect(
      detectRuntimeArtifactContentEncoding({
        path: "images/output.bin",
        bytes: new Uint8Array([0, 1, 2, 3]),
      }),
    ).toBe("base64");
  });
});
