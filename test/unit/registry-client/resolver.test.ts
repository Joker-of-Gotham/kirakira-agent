import { describe, expect, it } from "vitest";
import { resolveSource } from "../../../packages/registry-client/src/resolver.js";

describe("resolveSource", () => {
  it("parses registry:// prefix", () => {
    const s = resolveSource("registry://my-skill@1.0.0");
    expect(s.type).toBe("registry");
    expect(s.uri).toBe("my-skill");
    expect(s.ref).toBe("1.0.0");
  });

  it("parses npm: prefix", () => {
    const s = resolveSource("npm:@org/my-tool@2.3.4");
    expect(s.type).toBe("npm");
    expect(s.uri).toBe("@org/my-tool");
    expect(s.ref).toBe("2.3.4");
  });

  it("parses github: prefix", () => {
    const s = resolveSource("github:owner/repo@main");
    expect(s.type).toBe("github");
    expect(s.uri).toBe("owner/repo");
    expect(s.ref).toBe("main");
  });

  it("parses local: prefix", () => {
    const s = resolveSource("local:/home/user/skills/my-skill");
    expect(s.type).toBe("local");
    expect(s.uri).toBe("/home/user/skills/my-skill");
    expect(s.ref).toBeUndefined();
  });

  it("parses oci:// prefix", () => {
    const s = resolveSource("oci://ghcr.io/org/skill@latest");
    expect(s.type).toBe("oci");
    expect(s.uri).toBe("ghcr.io/org/skill");
    expect(s.ref).toBe("latest");
  });

  it("detects local paths starting with /", () => {
    const s = resolveSource("/absolute/path/to/skill");
    expect(s.type).toBe("local");
    expect(s.uri).toBe("/absolute/path/to/skill");
  });

  it("detects local paths starting with ./", () => {
    const s = resolveSource("./relative/path");
    expect(s.type).toBe("local");
    expect(s.uri).toBe("./relative/path");
    expect(s.ref).toBeUndefined();
  });

  it("defaults to registry for bare names", () => {
    const s = resolveSource("my-tool@1.0.0");
    expect(s.type).toBe("registry");
    expect(s.uri).toBe("my-tool");
    expect(s.ref).toBe("1.0.0");
  });

  it("defaults to registry for names without version", () => {
    const s = resolveSource("my-tool");
    expect(s.type).toBe("registry");
    expect(s.uri).toBe("my-tool");
    expect(s.ref).toBeUndefined();
  });

  it("uses specified default type", () => {
    const s = resolveSource("my-tool@1.0.0", "npm");
    expect(s.type).toBe("npm");
  });

  it("parses url: prefix", () => {
    const s = resolveSource("url:https://example.com/bundle.zip");
    expect(s.type).toBe("url");
    expect(s.uri).toBe("https://example.com/bundle.zip");
  });

  it("auto-detects https:// URLs", () => {
    const s = resolveSource("https://cdn.example.com/skill-v2.tar.gz");
    expect(s.type).toBe("url");
    expect(s.uri).toBe("https://cdn.example.com/skill-v2.tar.gz");
  });

  it("auto-detects http:// URLs", () => {
    const s = resolveSource("http://internal.example.com/bundle.zip");
    expect(s.type).toBe("url");
    expect(s.uri).toBe("http://internal.example.com/bundle.zip");
  });
});
