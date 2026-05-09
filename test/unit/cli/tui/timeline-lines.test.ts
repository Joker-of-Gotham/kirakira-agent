import { describe, expect, it } from "vitest";
import { buildTimelineLines } from "../../../../packages/cli/src/tui/timeline-lines.js";

describe("timeline-lines", () => {
  it("builds line-level transcript from a single long agent message", () => {
    const lines = buildTimelineLines({
      entries: [
        {
          id: "a1",
          ts: new Date().toISOString(),
          kind: "agent",
          text: [
            "## 尾声：新的开始",
            "",
            "暮色镇依然没有太阳，但人们发现，迷雾似乎变淡了一些。",
            "",
            "林默的钟表店依然开着。只是现在，门口多了一块新的招牌，上面刻着一行小字：",
            "",
            "“时间无法倒流，但记忆可以重塑。”",
          ].join("\n"),
        },
      ],
      thinking: false,
      width: 48,
    });

    // Even with only one entry, line-level rendering should expose many rows for scrolling.
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.some((l) => l.text.includes("尾声"))).toBe(true);
  });

  it("collapses repeated blank lines", () => {
    const lines = buildTimelineLines({
      entries: [
        {
          id: "a2",
          ts: new Date().toISOString(),
          kind: "agent",
          text: "段1\n\n\n段2\n\n\n\n段3",
        },
      ],
      thinking: false,
      width: 64,
    });

    let consecutiveBlank = 0;
    let maxConsecutiveBlank = 0;
    for (const ln of lines) {
      if (ln.text.trim() === "") {
        consecutiveBlank += 1;
      } else {
        maxConsecutiveBlank = Math.max(maxConsecutiveBlank, consecutiveBlank);
        consecutiveBlank = 0;
      }
    }
    maxConsecutiveBlank = Math.max(maxConsecutiveBlank, consecutiveBlank);
    expect(maxConsecutiveBlank).toBeLessThanOrEqual(1);
  });

  it("appends thinking preview lines", () => {
    const lines = buildTimelineLines({
      entries: [],
      thinking: true,
      thinkingText: "line1\nline2\nline3\nline4\nline5\nline6\nline7",
      width: 60,
    });

    expect(lines[0]?.text).toContain("thinking");
    expect(lines.some((l) => l.text.includes("hidden"))).toBe(true);
    expect(lines.some((l) => l.text.includes("line7"))).toBe(true);
  });

  it("hides tool/system lines when details is off", () => {
    const lines = buildTimelineLines({
      entries: [
        { id: "u1", ts: new Date().toISOString(), kind: "user", text: "hello" },
        { id: "t1", ts: new Date().toISOString(), kind: "tool", text: "tool detail line" },
        { id: "s1", ts: new Date().toISOString(), kind: "system", text: "system detail line" },
      ],
      thinking: false,
      width: 60,
      detailsLevel: "off",
    });

    expect(lines.some((l) => l.text.includes("tool detail line"))).toBe(false);
    expect(lines.some((l) => l.text.includes("system detail line"))).toBe(false);
    expect(lines.some((l) => l.text.includes("hello"))).toBe(true);
  });
});
