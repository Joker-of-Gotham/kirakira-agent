import { describe, expect, it } from "vitest";
import {
  classifyMentionToken,
  parseMentions,
} from "../../../../packages/cli/src/parser/mention.js";

describe("mention parser", () => {
  it("classifies file paths as file attachments", () => {
    const a = classifyMentionToken("src/file.ts");
    expect(a?.kind).toBe("file");
    expect(a?.path).toBe("src/file.ts");
  });

  it("classifies skill/name as skill", () => {
    const a = classifyMentionToken("skill/timeline-extraction");
    expect(a?.kind).toBe("skill");
    expect(a?.path).toBe("timeline-extraction");
  });

  it("classifies mcp/server:resource", () => {
    const a = classifyMentionToken("mcp/github:issues");
    expect(a?.kind).toBe("mcp");
    expect(a?.path).toBe("github:issues");
  });

  it("classifies session and trace prefixes", () => {
    expect(classifyMentionToken("session/abc-123")?.kind).toBe("session");
    expect(classifyMentionToken("session/abc-123")?.path).toBe("abc-123");
    expect(classifyMentionToken("trace/deadbeef")?.kind).toBe("trace");
    expect(classifyMentionToken("trace/deadbeef")?.path).toBe("deadbeef");
  });

  it("parseMentions extracts multiple tokens with full structure", () => {
    const xs = parseMentions("see @mcp/fs:read and @skill/foo bar");
    expect(xs).toHaveLength(2);
    expect(xs.map((x) => x.kind).sort()).toEqual(["mcp", "skill"]);
    const mcp = xs.find((x) => x.kind === "mcp");
    expect(mcp).toBeDefined();
    expect(mcp!.path).toBe("fs:read");
    const skill = xs.find((x) => x.kind === "skill");
    expect(skill).toBeDefined();
    expect(skill!.path).toBe("foo");
  });
});
