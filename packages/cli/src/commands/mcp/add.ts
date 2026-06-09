import { Command, Args, Flags } from "@oclif/core";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getMcpConfigPath } from "@kirakira/core";
import {
  runtimeMcpLocalEditNotice,
} from "../../runtime/runtime-mcp-config.js";

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
  const resolvedExtraArgs = defaultArgsForPackage(trimmed, extraArgs);

  if (trimmed.startsWith("node:")) {
    const localPath = trimmed.slice(5);
    return {
      serverName: deriveNameFromPath(localPath),
      command: "node",
      args: [localPath, ...resolvedExtraArgs],
      env: {},
    };
  }

  if (trimmed.startsWith("pypi:") || trimmed.startsWith("uvx:")) {
    const pkg = trimmed.split(":")[1]!;
    return {
      serverName: deriveNameFromPkg(pkg),
      command: "uvx",
      args: [pkg, ...resolvedExtraArgs],
      env: {},
    };
  }

  if (trimmed.startsWith("bun:")) {
    const pkg = trimmed.split(":")[1]!;
    return {
      serverName: deriveNameFromPkg(pkg),
      command: "bunx",
      args: [pkg, ...resolvedExtraArgs],
      env: { NODE_NO_WARNINGS: "1" },
    };
  }

  const isNpm = trimmed.startsWith("@") || trimmed.match(/^[a-z0-9@]/);
  if (isNpm) {
    return {
      serverName: deriveServerName(trimmed),
      command: "npx",
      args: ["-y", trimmed, ...resolvedExtraArgs],
      env: { NODE_NO_WARNINGS: "1" },
    };
  }

  return {
    serverName: deriveNameFromPath(trimmed),
    command: trimmed,
    args: [...resolvedExtraArgs],
    env: {},
  };
}

function defaultArgsForPackage(spec: string, extraArgs: string[]): string[] {
  if (extraArgs.length > 0) return [...extraArgs];
  if (spec.includes("server-filesystem")) {
    return [process.env.KIRAKIRA_WORKSPACE_ROOT || "."];
  }
  return [];
}

function deriveServerName(pkg: string): string {
  if (pkg.includes("@modelcontextprotocol/server-filesystem")) return "filesystem-core";
  return deriveNameFromPkg(pkg);
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
    "  $ pnpm start -- mcp add @modelcontextprotocol/server-memory\n" +
    "  $ pnpm start -- mcp add @modelcontextprotocol/server-filesystem\n" +
    "  $ pnpm start -- mcp add mcp-ripgrep@latest\n" +
    "  $ pnpm start -- mcp add pypi:mcp-server-fetch\n" +
    "  $ pnpm start -- mcp add node:./my-server/dist/index.js\n";

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

    const configPath = await this.writeEntry(serverName, entry);

    this.log(`\n✓ Added MCP server "${serverName}"`);
    this.log(`  local edit target: ${configPath}`);
    await this.logProjectionNotice(configPath, [serverName]);
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

    const configPath = await this.writeEntry(serverName, entry);
    this.log(`  local edit target: ${configPath}`);
    await this.logProjectionNotice(configPath, [serverName]);
    this.log(`✓ Added HTTP MCP server "${serverName}" → ${flags.url}`);
  }

  private async writeEntry(
    serverName: string,
    entry: Record<string, unknown>,
  ): Promise<string> {
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
    return configPath;
  }

  private async logProjectionNotice(
    configPath: string,
    editedServers: string[],
  ): Promise<void> {
    const notice = await runtimeMcpLocalEditNotice({
      configPath,
      serverNames: editedServers,
      action: "upsert",
    });
    if (!notice) return;
    if (notice.level === "warn") this.warn(notice.message);
    else this.log(`  ${notice.message}`);
  }
}
