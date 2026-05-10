import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { Timeline, allocateVisibleTimelineRows, measureTimelineRows, selectVisibleTimelineLines } from "../../packages/cli/src/tui/Timeline.js";
import { InputArea } from "../../packages/cli/src/tui/InputArea.js";
import { HotkeyBar } from "../../packages/cli/src/tui/HotkeyBar.js";
import { HomeScreen } from "../../packages/cli/src/tui/HomeScreen.js";
import { buildTimelineLines } from "../../packages/cli/src/tui/timeline-lines.js";
import { resolveTheme } from "../../packages/cli/src/tui/theme.js";
import type { TimelineEntry } from "../../packages/cli/src/tui/types.js";

const requireFromCli = createRequire(new URL("../../packages/cli/package.json", import.meta.url));

async function importFromCli<T>(specifier: string): Promise<T> {
  const resolved = requireFromCli.resolve(specifier);
  return import(pathToFileURL(resolved).href) as Promise<T>;
}

class MockTty extends Writable {
  columns: number;
  rows: number;
  isTTY = true;
  private readonly chunks: string[] = [];

  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk as Uint8Array | string).toString("utf8"));
    callback();
  }

  clear(): void {
    this.chunks.length = 0;
  }

  snapshot(): string {
    return stripAnsi(this.chunks.join("")).replace(/\r/g, "").trimEnd();
  }
}

function stripAnsi(input: string): string {
  return input
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gu, "")
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/gu, "");
}

function setProcessTerminalSize(columns: number, rows: number): { columns?: number; rows?: number } {
  const stdout = process.stdout as typeof process.stdout & { columns?: number; rows?: number };
  const previous = { columns: stdout.columns, rows: stdout.rows };
  stdout.columns = columns;
  stdout.rows = rows;
  return previous;
}

function restoreProcessTerminalSize(previous: { columns?: number; rows?: number }): void {
  const stdout = process.stdout as typeof process.stdout & { columns?: number; rows?: number };
  stdout.columns = previous.columns;
  stdout.rows = previous.rows;
}

function lineCount(frame: string): number {
  if (!frame) return 0;
  return frame.split("\n").length;
}

function expectBoundedFrame(frame: string, rows: number, mustContain: string): void {
  expect(frame).toContain(mustContain);
  expect(frame.includes("undefined")).toBe(false);
  expect(frame.includes("NaN")).toBe(false);
  expect(frame.includes("\\n")).toBe(false);
  expect(lineCount(frame)).toBeLessThanOrEqual(rows);
}

function buildMixedMarkdown(tag: string): string {
  return [
    `## Architecture ${tag}`,
    "",
    "**Core flow**",
    "",
    "1. Discover packages",
    "2. Inspect runtime cards",
    "3. Preserve composer visibility",
    "",
    "| Module | Role | Risk |",
    "| --- | --- | --- |",
    "| cli | terminal shell | medium |",
    "| agent-runtime | loop engine | high |",
    "",
    "> Resize should keep cards stable.",
    "",
    "- 中文段落：这里用于测试中英混排、粗体、表格和列表在窄窗口下的换行。",
    "- English paragraph: the layout must remain readable even when the viewport becomes narrow.",
    "",
    `Summary ${tag}: keep the composer visible and stop cards from overlapping.`,
  ].join("\n");
}

function makeStressEntries(blocks = 6): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (let index = 0; index < blocks; index += 1) {
    entries.push({
      id: `u${index}`,
      ts: new Date().toISOString(),
      kind: "user",
      text: `@packages/ Explain architecture block ${index} and note resize risks.`,
    });
    entries.push({
      id: `tc${index}`,
      ts: new Date().toISOString(),
      kind: "tool_call",
      text: `call shell ${JSON.stringify({
        command: `Get-ChildItem packages -Directory | Select-Object Name # block ${index}`,
      })}`,
    });
    entries.push({
      id: `tr${index}`,
      ts: new Date().toISOString(),
      kind: "tool_result",
      text: `done shell ${20 + index}ms ${JSON.stringify({
        path: `/workspace/packages/block-${index}`,
        content: [
          {
            type: "text",
            text: `[\n  {"name":"cli","type":"directory"},\n  {"name":"agent-runtime","type":"directory"},\n  {"name":"core","type":"directory"}\n]`,
          },
        ],
        structuredContent: {
          content: `[\n  {"name":"cli","type":"directory"},\n  {"name":"agent-runtime","type":"directory"},\n  {"name":"core","type":"directory"}\n]`,
        },
      })}`,
    });
    entries.push({
      id: `a${index}`,
      ts: new Date().toISOString(),
      kind: "agent",
      text: buildMixedMarkdown(`block-${index}`),
    });
  }
  return entries;
}

describe("tui layout stability", () => {
  it("keeps visible timeline cards within the viewport budget across widths, heights, scroll, and expansion states", () => {
    const theme = resolveTheme("kirakira", process.cwd());
    const entries = makeStressEntries(8);

    for (const cols of [36, 44, 56, 72, 96, 120]) {
      const width = Math.max(24, cols - 12);
      const lines = buildTimelineLines({
        entries,
        thinking: false,
        width,
        detailsLevel: "compact",
        thinkingMode: "summary",
        density: "default",
        theme,
      });

      for (const visibleCount of [6, 8, 12, 16, 22]) {
        const totalRows = measureTimelineRows(lines, width, false, theme);
        const maxScroll = Math.max(0, totalRows - visibleCount);
        const offsets = [0, Math.floor(maxScroll / 2), maxScroll];

        for (const expanded of [false, true]) {
          for (const scrollOffset of offsets) {
            const result = selectVisibleTimelineLines(lines, visibleCount, scrollOffset, width, expanded, theme);
            const usedRows = allocateVisibleTimelineRows(result.visible)
              .reduce((sum, value) => sum + value, 0);

            expect(result.visible.length).toBeGreaterThan(0);
            expect(usedRows).toBeLessThanOrEqual(visibleCount);
          }
        }
      }
    }
  });

  it("renders the transcript surface without losing the composer under repeated resize", async () => {
    const ReactModule = await importFromCli<{ default?: { createElement: (...args: any[]) => any } }>("react");
    const InkModule = await importFromCli<{
      render: (...args: any[]) => { rerender: (...args: any[]) => void; unmount: () => void };
      Box: any;
    }>("ink");
    const React = ReactModule.default!;
    const { render, Box } = InkModule;
    const theme = resolveTheme("kirakira", process.cwd());
    const entries = makeStressEntries(5);

    const makeTree = (cols: number, rows: number, expandedToolResults: boolean) => {
      const contentWidth = Math.max(24, cols - 12);
      const lines = buildTimelineLines({
        entries,
        thinking: false,
        width: contentWidth,
        detailsLevel: "compact",
        thinkingMode: "summary",
        density: "default",
        theme,
      });

      return React.createElement(
        Box,
        { flexDirection: "column", width: cols, height: rows },
        React.createElement(Timeline, {
          lines,
          hasContent: true,
          scrollOffset: 0,
          visibleCount: Math.max(4, rows - 4),
          focusArea: "input",
          theme,
          expandedToolResults,
          contentWidth,
        }),
        React.createElement(InputArea, {
          value: "draft prompt",
          cursorIndex: "draft prompt".length,
          mode: "agent",
          thinking: false,
          focused: true,
          theme,
          model: "qwen3.5-35b-a3b",
          attachments: [
            { kind: "file", path: "/workspace/packages/cli/src/tui/Timeline.tsx" },
            { kind: "memory", path: "memory/workspace/current/schemas" },
          ],
          taskCount: 0,
        }),
        React.createElement(HotkeyBar, {
          paletteActive: false,
          focusArea: "input",
          theme,
          toolResultsExpanded: false,
        }),
      );
    };

    const stdout = new MockTty(104, 28);
    const previousSize = setProcessTerminalSize(104, 28);
    try {
      const app = render(makeTree(104, 28, false), { stdout, stderr: stdout, exitOnCtrlC: false });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expectBoundedFrame(stdout.snapshot(), 28, "draft prompt");

      for (const [cols, rows, expanded] of [[72, 22, false], [46, 16, false], [38, 14, true], [132, 34, false]] as const) {
        stdout.columns = cols;
        stdout.rows = rows;
        setProcessTerminalSize(cols, rows);
        stdout.clear();
        app.rerender(makeTree(cols, rows, expanded));
        await new Promise((resolve) => setTimeout(resolve, 80));
        expectBoundedFrame(stdout.snapshot(), rows, "draft prompt");
      }

      app.unmount();
    } finally {
      restoreProcessTerminalSize(previousSize);
    }
  });

  it("scrolls a long assistant markdown card one visual row at a time", () => {
    const theme = resolveTheme("kirakira", process.cwd());
    const lines = buildTimelineLines({
      entries: [{
        id: "agent_big",
        ts: new Date().toISOString(),
        kind: "agent",
        text: [
          "# Large response",
          "",
          "Paragraph one with mixed width content and markdown formatting.",
          "",
          "```typescript",
          "export function hello(name: string) {",
          "  return `hello ${name}`;",
          "}",
          "```",
          "",
          "| module | role |",
          "| --- | --- |",
          "| cli | tui |",
          "| core | runtime |",
          "",
          "- alpha",
          "- beta",
          "- gamma",
          "",
          "Tail paragraph that should stay reachable while scrolling.",
        ].join("\n"),
      }],
      thinking: false,
      width: 44,
      theme,
    });

    const visibleAtBottom = selectVisibleTimelineLines(lines, 8, 0, 44, false, theme);
    const visibleOneRowUp = selectVisibleTimelineLines(lines, 8, 1, 44, false, theme);

    expect(visibleAtBottom.visible).toHaveLength(1);
    expect(visibleOneRowUp.visible).toHaveLength(1);
    expect(visibleAtBottom.visible[0]?.line.id).toBe("agent_big");
    expect(visibleOneRowUp.visible[0]?.line.id).toBe("agent_big");
    expect(visibleOneRowUp.visible[0]?.startRow).toBe((visibleAtBottom.visible[0]?.startRow ?? 0) - 1);
  });

  it("renders the home screen inside narrow windows without blowing up the frame", async () => {
    const ReactModule = await importFromCli<{ default?: { createElement: (...args: any[]) => any } }>("react");
    const InkModule = await importFromCli<{
      render: (...args: any[]) => { unmount: () => void };
      Box: any;
    }>("ink");
    const React = ReactModule.default!;
    const { render, Box } = InkModule;
    const theme = resolveTheme("kirakira", process.cwd());

    const makeTree = (cols: number, rows: number) =>
      React.createElement(
        Box,
        { flexDirection: "column", width: cols, height: rows },
        React.createElement(
          HomeScreen,
          { theme },
          React.createElement(InputArea, {
            value: "",
            cursorIndex: 0,
            mode: "agent",
            thinking: false,
            focused: true,
            theme,
            model: "qwen3.5-35b-a3b",
            attachments: [],
            taskCount: 0,
          }),
        ),
      );

    for (const [cols, rows] of [[44, 18], [64, 22], [96, 28]] as const) {
      const stdout = new MockTty(cols, rows);
      const previousSize = setProcessTerminalSize(cols, rows);
      try {
        const app = render(makeTree(cols, rows), { stdout, stderr: stdout, exitOnCtrlC: false });
        await new Promise((resolve) => setTimeout(resolve, 80));
        expectBoundedFrame(stdout.snapshot(), rows, "Ask anything");
        app.unmount();
      } finally {
        restoreProcessTerminalSize(previousSize);
      }
    }
  });
});
