import { describe, expect, it } from "vitest";
import {
  estimateMarkdownRows,
  renderMarkdownRows,
  renderMarkdownToAnsi,
} from "../../../../packages/cli/src/tui/md-render.js";

describe("md-render", () => {
  it("renders fenced code blocks, rules, and tables as structured rows", () => {
    const markdown = [
      "# Title",
      "",
      "```typescript",
      "const value = 1;",
      "console.log(value);",
      "```",
      "",
      "---",
      "",
      "| name | role |",
      "| --- | --- |",
      "| cli | tui |",
      "| core | runtime |",
    ].join("\n");

    const rows = renderMarkdownRows(markdown, 48);
    const textRows = rows.map((row) => row.type === "inline" ? row.tokens.map((token) => token.text).join("") : row.text);

    expect(textRows.some((row) => row.includes("```"))).toBe(false);
    expect(textRows.some((row) => row.includes("const value = 1;"))).toBe(true);
    expect(textRows.some((row) => row.startsWith("+"))).toBe(true);
    expect(textRows.some((row) => /^-+$/.test(row))).toBe(true);
    expect(estimateMarkdownRows(markdown, 48)).toBe(rows.length);
  });

  it("strips markdown fences from ansi transcript rendering", () => {
    const ansi = renderMarkdownToAnsi([
      "**Bold**",
      "",
      "```json",
      "{\"ok\":true}",
      "```",
    ].join("\n"));

    expect(ansi).toContain("Bold");
    expect(ansi).toContain("{\"ok\":true}");
    expect(ansi).not.toContain("```");
  });
});
