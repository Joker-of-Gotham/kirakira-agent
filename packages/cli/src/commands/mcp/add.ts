import { Command, Args, Flags } from "@oclif/core";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getMcpConfigPath } from "@kirakira/core";

/* ------------------------------------------------------------------ */
/*  Smart package detection                                            */
/* ------------------------------------------------------------------ */

interface PackageSpec {
  serverName: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Detect package ecosystem from the package specifier and produce a
 * runnable MCP server config entry automatically.
 *
 * Supported patterns:
 *   @modelcontextprotocol/server-memory     → npx -y @modelcontextprotocol/server-memory
 *   @modelcontextprotocol/server-filesystem → npx -y @modelcontextprotocol/server-filesystem .
 *   mcp-ripgrep                             → npx -y mcp-ripgrep
 *   mcp-ripgrep@latest                      → npx -y mcp-ripgrep@latest
 *   mcp-server-git (uvx-style)              → uvx mcp-server-git
 *   pypi:mcp-server-fetch                   → uvx mcp-server-fetch
 *   node:./path/to/server.js                → node ./path/to/server.js
 */
function detectPackage(spec: string, extraArgs: string[]): PackageSpec {
  const trimmed = spec.trim();

  if (trimmed.startsWith("node:")) {
    const localPath = trimmed.slice(5);
    return {
      serverName: deriveNameFromPath(localPath),
      command: "node",
      args: [localPath, ...extraArgs],
      env: {},
    };
  }

  if (trimmed.startsWith("pypi:") || trimmed.startsWith("uvx:")) {
    const pkg = trimmed.split(":")[1]!;
    return {
      serverName: deriveNameFromPkg(pkg),
      command: "uvx",
      args: [pkg, ...extraArgs],
      env: {},
    };
  }

  if (trimmed.startsWith("bun:")) {
    const pkg = trimmed.split(":")[1]!;
    return {
      serverName: deriveNameFromPkg(pkg),
      command: "bunx",
      args: [pkg, ...extraArgs],
      env: { NODE_NO_WARNINGS: "1" },
    };
  }

  const isNpm = trimmed.startsWith("@") || trimmed.match(/^[a-z0-9@]/);
  if (isNpm) {
    return {
      serverName: deriveNameFromPkg(trimmed),
      command: "npx",
      args: ["-y", trimmed, ...extraArgs],
      env: { NODE_NO_WARNINGS: "1" },
    };
  }

  return {
    serverName: deriveNameFromPath(trimmed),
    command: trimmed,
    args: [...extraArgs],
    env: {},
  };
}

function deriveNameFromPkg(pkg: string): string {
  let name = pkg
    .replace(/@[^/]*\//, "")   // strip scope
    .replace(/@.*$/, "")       // strip version
    .replace(/^server-/, "")   // @modelcontextprotocol/server-X → X
    .replace(/^mcp-server-/, "")
    .replace(/^mcp-/, "");
  if (!name) name = "mcp-server";
  return name;
}

function deriveNameFromPath(p: string): string {
  const base = p.split("/").pop() ?? p;
  return base.replace(/\.(js|ts|mjs)$/, "").replace(/^index$/, "local-server");
}

/* ------------------------------------------------------------------ */
/*  Command                                                            */
/* ------------------------------------------------------------------ */

export default class McpAdd extends Command {
  static override description =
    "Add an MCP server — auto-configures from a package name\n\n" +
    "Examples:\n" +
    "  $ kirakira-agent mcp add @modelcontextprotocol/server-memory\n" +
    "  $ kirakira-agent mcp add @modelcontextprotocol/server-filesystem -- .\n" +
    "  $ kirakira-agent mcp add mcp-ripgrep@latest\n" +
    "  $ kirakira-agent mcp add pypi:mcp-server-fetch\n" +
    "  $ kirakira-agent mcp add node:./my-server/dist/index.js\n";

  static override strict = false;

  static override args = {
    package: Args.string({
      description:
        "Package spec: npm package, pypi:pkg, uvx:pkg, node:./path, or bare command",
      required: true,
    }),
  };

  static override flags = {
    name: Flags.string({
      char: "n",
      description: "Override the auto-derived server name",
    }),
    transport: Flags.string({
      description: "Transport type (auto-detected for most packages)",
      options: ["stdio", "http"],
    }),
    command: Flags.string({
      description: "Override the auto-detected command",
    }),
    url: Flags.string({
      description: "URL for HTTP transport",
    }),
    env: Flags.string({
      description: "Extra env var in KEY=VALUE format (repeatable)",
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags, argv: rawArgv } = await this.parse(McpAdd);

    const passthrough = (rawArgv as string[]).filter(
      (a) =>
        a !== args.package &&
        !a.startsWith("-") &&
        a !== "--",
    );

    if (flags.transport === "http" || flags.url) {
      return this.addHttpServer(args.package, flags);
    }

    const spec = detectPackage(args.package, passthrough);

    const serverName = flags.name ?? spec.serverName;
    const command = flags.command ?? spec.command;
    const cmdArgs = spec.args;

    const env: Record<string, string> = { ...spec.env };
    if (flags.env?.length) {
      for (const pair of flags.env) {
        const idx = pair.indexOf("=");
        if (idx < 1) {
          this.error(`Invalid env format: "${pair}". Expected KEY=VALUE`);
        }
        env[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
    }

    const entry: Record<string, unknown> = { command, args: cmdArgs };
    if (Object.keys(env).length > 0) {
      entry["env"] = env;
    }

    await this.writeEntry(serverName, entry);

    this.log(`\n✓ Added MCP server "${serverName}"`);
    this.log(`  command: ${command} ${cmdArgs.join(" ")}`);
    this.log(`\nThe server will be auto-discovered when you start the agent.`);
    this.log(`All tools will be available as mcp.${serverName}.<tool_name>\n`);
  }

  private async addHttpServer(
    name: string,
    flags: { name?: string; url?: string; env?: string[] },
  ): Promise<void> {
    if (!flags.url) {
      this.error("--url is required for HTTP transport");
    }
    const serverName = flags.name ?? deriveNameFromPkg(name);
    const entry: Record<string, unknown> = { type: "http", url: flags.url };

    if (flags.env?.length) {
      const envObj: Record<string, string> = {};
      for (const pair of flags.env) {
        const idx = pair.indexOf("=");
        if (idx < 1) this.error(`Invalid env format: "${pair}".`);
        envObj[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
      entry["env"] = envObj;
    }

    await this.writeEntry(serverName, entry);
    this.log(`✓ Added HTTP MCP server "${serverName}" → ${flags.url}`);
  }

  private async writeEntry(
    serverName: string,
    entry: Record<string, unknown>,
  ): Promise<void> {
    const configPath = getMcpConfigPath(process.cwd());

    let config: { mcpServers: Record<string, unknown> } = { mcpServers: {} };
    if (existsSync(configPath)) {
      const raw = await readFile(configPath, "utf-8");
      config = JSON.parse(raw) as typeof config;
      if (!config.mcpServers) config.mcpServers = {};
    }

    if (config.mcpServers[serverName]) {
      this.warn(`Server "${serverName}" already exists — overwriting.`);
    }

    config.mcpServers[serverName] = entry;

    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(config, null, 2) + "\n",
      "utf-8",
    );
  }
}
