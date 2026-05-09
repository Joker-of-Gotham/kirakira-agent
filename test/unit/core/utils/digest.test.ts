import { describe, expect, it } from "vitest";
import { sha256Hex, sha256Prefixed } from "@kirakira/core";

describe("digest", () => {
  it("sha256Hex matches known vector for 'hello'", () => {
    expect(sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("sha256Prefixed prefixes algorithm id", () => {
    expect(sha256Prefixed("hello")).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
