import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import { HomeScreen } from "../../../../packages/cli/src/tui/HomeScreen.js";
import { ProviderSetup } from "../../../../packages/cli/src/tui/ProviderSetup.js";
import { resolveTheme } from "../../../../packages/cli/src/tui/theme.js";
import { LLM_PROVIDERS } from "../../../../packages/cli/src/gateway/provider-catalog.js";

const requireFromCli = createRequire(new URL("../../../../packages/cli/package.json", import.meta.url));

async function importFromCli<T>(specifier: string): Promise<T> {
  const resolved = requireFromCli.resolve(specifier);
  return import(pathToFileURL(resolved).href) as Promise<T>;
}

const providerCatalogMock = vi.hoisted(() => ({
  discoverProviderModels: vi.fn(),
}));

vi.mock("../../../../packages/cli/src/gateway/provider-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../packages/cli/src/gateway/provider-catalog.js")>();
  return {
    ...actual,
    discoverProviderModels: providerCatalogMock.discoverProviderModels,
  };
});

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

class MockStdin extends Readable {
  isTTY = true;
  isRaw = false;

  _read(): void {}

  setRawMode(value: boolean): this {
    this.isRaw = value;
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  send(input: string): void {
    this.push(input);
  }
}

const ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "LLM_CHAT_COMPLETIONS_URL",
  "LLM_MODEL",
  "LLM_API_KEY",
  ...LLM_PROVIDERS.map((provider) => provider.keyEnv),
];

let previousEnv: Record<string, string | undefined>;

beforeEach(() => {
  previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  providerCatalogMock.discoverProviderModels.mockReset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("provider setup and home screen TUI", () => {
  it("renders the home screen shell in compact and wide terminals without layout artifacts", async () => {
    const ReactModule = await importFromCli<{ default?: { createElement: (...args: any[]) => any } }>("react");
    const InkModule = await importFromCli<{
      render: (...args: any[]) => { unmount: () => void; waitUntilRenderFlush: () => Promise<void> };
      Text: any;
    }>("ink");
    const React = ReactModule.default!;
    const { render, Text } = InkModule;
    const theme = resolveTheme("kirakira", process.cwd());

    for (const [columns, rows] of [[58, 18], [122, 30]] as const) {
      const stdout = new MockTty(columns, rows);
      const previousSize = setProcessTerminalSize(columns, rows);
      try {
        const app = render(
          React.createElement(
            HomeScreen,
            { theme },
            React.createElement(Text, null, "Provider setup entrypoint"),
          ),
          { stdout, stderr: stdout, exitOnCtrlC: false, interactive: true },
        );
        await app.waitUntilRenderFlush();
        const frame = stdout.snapshot();
        expect(frame).toContain("Provider setup entrypoint");
        expect(frame).toContain("type / for commands");
        expect(frame).not.toContain("undefined");
        expect(frame).not.toContain("NaN");
        expect(lineCount(frame)).toBeLessThanOrEqual(rows);
        app.unmount();
      } finally {
        restoreProcessTerminalSize(previousSize);
      }
    }
  });

  it("walks provider setup from provider choice to persisted model selection", async () => {
    const ReactModule = await importFromCli<{ default?: { createElement: (...args: any[]) => any } }>("react");
    const InkModule = await importFromCli<{
      render: (...args: any[]) => { unmount: () => void; waitUntilRenderFlush: () => Promise<void> };
    }>("ink");
    const React = ReactModule.default!;
    const { render } = InkModule;
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-provider-setup-"));
    const stdout = new MockTty(110, 32);
    const stdin = new MockStdin();
    const theme = resolveTheme("kirakira", process.cwd());
    const onConfigured = vi.fn();
    const selectedProvider = LLM_PROVIDERS[1]!;
    providerCatalogMock.discoverProviderModels.mockResolvedValue({
      models: ["qwen3.6-plus", "qwen3-coder-plus"],
      source: "live",
      detail: "mocked model catalog",
    });
    const previousSize = setProcessTerminalSize(110, 32);

    try {
      const app = render(
        React.createElement(ProviderSetup, { workspaceRoot, theme, onConfigured }),
        {
          stdin: stdin as unknown as NodeJS.ReadStream,
          stdout,
          stderr: stdout,
          exitOnCtrlC: false,
          interactive: true,
        },
      );
      await app.waitUntilRenderFlush();
      expect(stdout.snapshot()).toContain("Choose a provider to configure this workspace.");

      stdout.clear();
      stdin.send("2");
      await waitForFrame(stdout, selectedProvider.keyEnv);

      stdout.clear();
      sendText(stdin, "dashscope-test-key");
      await waitForFrame(stdout, "******************");
      stdout.clear();
      stdin.send("\r");
      await waitForFrame(stdout, "Detected 2 models. Choose one to continue.");
      expect(providerCatalogMock.discoverProviderModels).toHaveBeenCalledWith(
        selectedProvider,
        "dashscope-test-key",
      );

      stdout.clear();
      sendText(stdin, "coder");
      await waitForFrame(stdout, "qwen3-coder-plus");

      stdin.send("\r");
      await waitForExpectation(() => {
        expect(onConfigured).toHaveBeenCalledWith(
          {
            baseUrl: selectedProvider.baseUrl,
            apiKey: "dashscope-test-key",
            defaultModel: "qwen3-coder-plus",
          },
          selectedProvider,
        );
      });

      const envText = await readFile(join(workspaceRoot, ".env"), "utf8");
      expect(envText).toContain("LLM_PROVIDER=aliyun-bailian");
      expect(envText).toContain("LLM_MODEL=qwen3-coder-plus");
      expect(envText).toContain("DASHSCOPE_API_KEY=dashscope-test-key");
      expect(process.env.LLM_PROVIDER).toBe("aliyun-bailian");
      expect(process.env.LLM_MODEL).toBe("qwen3-coder-plus");
      app.unmount();
    } finally {
      restoreProcessTerminalSize(previousSize);
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("keeps provider setup escape navigation bounded and non-destructive", async () => {
    const ReactModule = await importFromCli<{ default?: { createElement: (...args: any[]) => any } }>("react");
    const InkModule = await importFromCli<{
      render: (...args: any[]) => { unmount: () => void; waitUntilRenderFlush: () => Promise<void> };
    }>("ink");
    const React = ReactModule.default!;
    const { render } = InkModule;
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-provider-setup-escape-"));
    const stdout = new MockTty(92, 24);
    const stdin = new MockStdin();
    const theme = resolveTheme("kirakira", process.cwd());
    const previousSize = setProcessTerminalSize(92, 24);

    try {
      const app = render(
        React.createElement(ProviderSetup, { workspaceRoot, theme, onConfigured: vi.fn() }),
        {
          stdin: stdin as unknown as NodeJS.ReadStream,
          stdout,
          stderr: stdout,
          exitOnCtrlC: false,
          interactive: true,
        },
      );
      await app.waitUntilRenderFlush();

      stdout.clear();
      stdin.send("1");
      await waitForFrame(stdout, "OPENAI_API_KEY");

      stdout.clear();
      stdin.send("\u001B");
      await waitForFrame(stdout, "Choose a provider to configure this workspace.");
      expect(stdout.snapshot()).toContain("> 1. OpenAI Platform");
      app.unmount();
    } finally {
      restoreProcessTerminalSize(previousSize);
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

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

function stripAnsi(input: string): string {
  return input
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gu, "")
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/gu, "");
}

function lineCount(frame: string): number {
  return frame ? frame.split("\n").length : 0;
}

function sendText(stdin: MockStdin, text: string): void {
  for (const char of text) {
    stdin.send(char);
  }
}

async function waitForFrame(stdout: MockTty, text: string): Promise<void> {
  await waitForExpectation(() => {
    expect(stdout.snapshot()).toContain(text);
  });
}

async function waitForExpectation(assertion: () => void, timeoutMs = 1200): Promise<void> {
  const startedAt = Date.now();
  let latestError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      latestError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw latestError;
}
