import { useCallback } from "react";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionEvent } from "@kirakira/core";
import { listSessionFiles, readSessionEvents, sessionFileMtime } from "../../session/store.js";
import { SLASH_COMMAND_DEFS } from "../types.js";
import type { DensityMode } from "../types.js";
import type { InspectorTab, ThinkingDisplayMode, ToolDetailsLevel, TuiMode } from "../types.js";
import { MODE_META } from "../types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export interface SlashContext {
  session: { id: string; traceId: string };
  model: string;
  themeName: string;
  availableThemes: string[];
  detailsLevel: ToolDetailsLevel;
  thinkingMode: ThinkingDisplayMode;
  density: DensityMode;
  mode: TuiMode;
  workspaceName: string;
  workspaceRoot: string;
  vimMode: boolean;
  autoRun: boolean;
  trust: string;
  messages: Array<{ role: string; content: string }>;

  setMode: (m: TuiMode) => void;
  setModel: (m: string) => void;
  setThemeName: (name: string) => void;
  setDetailsLevel: (level: ToolDetailsLevel) => void;
  setThinkingMode: (mode: ThinkingDisplayMode) => void;
  setDensity: (d: DensityMode) => void;
  setVimMode: (v: boolean) => void;
  setAutoRun: (v: boolean) => void;
  addSystemTimeline: (text: string) => void;
  clearHistory: () => void;
  resetSession: (model: string, mode: string, workspaceName: string) => Promise<void>;
  compact: (model: string) => Promise<void>;
  resumeSession: (id: string) => Promise<SessionEvent[]>;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  showDrawer: (tab: InspectorTab) => void;
  openSetup?: () => void;
  requestExit: () => void;
  mcpAdd?: (pkg: string) => Promise<void>;
  mcpRefresh?: () => Promise<void>;
  mcpServers: Array<{ name: string; healthy: boolean }>;
  mcpToolCount: number;
}

export interface UseSlashReturn {
  handleSlash: (command: string, args: string) => Promise<void>;
}

export function useSlash(ctx: SlashContext): UseSlashReturn {
  const handleSlash = useCallback(async (command: string, args: string) => {
    const cmd = command.toLowerCase().trim();

    switch (cmd) {
      case "":
      case "help": {
        const lines = SLASH_COMMAND_DEFS.map(
          (d) => `  /${d.name.padEnd(18)} ${d.description}`,
        ).join("\n");
        ctx.addSystemTimeline(`Slash commands:\n${lines}`);
        return;
      }

      case "quit":
      case "exit": {
        ctx.requestExit();
        return;
      }

      case "new": {
        ctx.clearHistory();
        await ctx.resetSession(ctx.model, ctx.mode, ctx.workspaceName);
        ctx.addSystemTimeline("New session started — history cleared.");
        return;
      }

      case "model": {
        const name = args.trim();
        if (!name) {
          ctx.addSystemTimeline(`Current model: ${ctx.model}`);
          return;
        }
        ctx.setModel(name);
        ctx.addSystemTimeline(`Model → ${name}`);
        return;
      }

      case "models": {
        if (ctx.openSetup) {
          ctx.openSetup();
          ctx.addSystemTimeline("Opening model setup.");
        } else {
          ctx.addSystemTimeline(`Current model: ${ctx.model}\nUsage: /model <name>`);
        }
        return;
      }

      case "agent": {
        ctx.setMode("agent");
        ctx.addSystemTimeline(`Mode → ${MODE_META.agent.icon} agent — ${MODE_META.agent.desc}`);
        return;
      }

      case "plan": {
        ctx.setMode("plan");
        ctx.addSystemTimeline(`Mode → ${MODE_META.plan.icon} plan — ${MODE_META.plan.desc}`);
        return;
      }

      case "ask": {
        ctx.setMode("ask");
        ctx.addSystemTimeline(`Mode → ${MODE_META.ask.icon} ask — ${MODE_META.ask.desc}`);
        return;
      }

      case "debug": {
        ctx.setMode("debug");
        ctx.addSystemTimeline(`Mode → ${MODE_META.debug.icon} debug — ${MODE_META.debug.desc}`);
        return;
      }

      case "resume": {
        const id = args.trim();
        if (!id) {
          ctx.addSystemTimeline("Usage: /resume <session-id>");
          return;
        }
        try {
          const events = await ctx.resumeSession(id);
          ctx.addSystemTimeline(`Resumed session ${id} (${events.length} events).`);
        } catch (e) {
          ctx.addSystemTimeline(`Resume failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }

      case "sessions": {
        ctx.showDrawer("sessions");
        try {
          const ids = await listSessionFiles();
          if (ids.length === 0) {
            ctx.addSystemTimeline("No local sessions found.");
            return;
          }
          const withTime = await Promise.all(
            ids.map(async (id) => ({ id, mtime: await sessionFileMtime(id) })),
          );
          withTime.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
          const lines = withTime
            .slice(0, 12)
            .map((s) => {
              const mark = s.id === ctx.session.id ? "▸" : " ";
              const ts = s.mtime.toISOString().slice(0, 19).replace("T", " ");
              return `${mark} ${s.id}  (${ts})`;
            })
            .join("\n");
          ctx.addSystemTimeline(`Sessions:\n${lines}\n\nUse /resume <session-id>`);
        } catch (e) {
          ctx.addSystemTimeline(`List sessions failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }

      case "continue": {
        try {
          const ids = await listSessionFiles();
          if (ids.length === 0) {
            ctx.addSystemTimeline("No local sessions to continue.");
            return;
          }
          const withTime = await Promise.all(
            ids.map(async (id) => ({ id, mtime: await sessionFileMtime(id) })),
          );
          withTime.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
          const latest = withTime[0]?.id;
          if (!latest) {
            ctx.addSystemTimeline("No resumable session found.");
            return;
          }
          await ctx.resumeSession(latest);
          ctx.addSystemTimeline(`Continued latest session: ${latest}`);
          ctx.showDrawer("sessions");
        } catch (e) {
          ctx.addSystemTimeline(`Continue failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }

      case "compact": {
        await ctx.compact(ctx.model);
        return;
      }

      case "undo": {
        if (!ctx.canUndo) {
          ctx.addSystemTimeline("Nothing to undo.");
          return;
        }
        const ok = ctx.undo();
        ctx.addSystemTimeline(ok ? "Undo applied." : "Undo failed.");
        return;
      }

      case "redo": {
        if (!ctx.canRedo) {
          ctx.addSystemTimeline("Nothing to redo.");
          return;
        }
        const ok = ctx.redo();
        ctx.addSystemTimeline(ok ? "Redo applied." : "Redo failed.");
        return;
      }

      case "details": {
        const arg = args.trim().toLowerCase();
        if (!arg) {
          ctx.addSystemTimeline(`Details: ${ctx.detailsLevel}\nUsage: /details off|compact|full`);
          return;
        }
        if (arg === "off" || arg === "compact" || arg === "full") {
          ctx.setDetailsLevel(arg);
          ctx.addSystemTimeline(`Details → ${arg}`);
          return;
        }
        ctx.addSystemTimeline("Invalid details level. Use off|compact|full.");
        return;
      }

      case "density": {
        const arg = args.trim().toLowerCase();
        if (!arg) {
          ctx.addSystemTimeline(`Density: ${ctx.density}\nUsage: /density spacious|default|compact|dense`);
          return;
        }
        if (arg === "spacious" || arg === "default" || arg === "compact" || arg === "dense") {
          ctx.setDensity(arg);
          ctx.addSystemTimeline(`Density → ${arg}`);
          return;
        }
        ctx.addSystemTimeline("Invalid density. Use spacious|default|compact|dense.");
        return;
      }

      case "thinking": {
        const arg = args.trim().toLowerCase();
        if (!arg) {
          ctx.addSystemTimeline(
            `Thinking: ${ctx.thinkingMode}\nUsage: /thinking off|summary|model`,
          );
          return;
        }
        if (arg === "off" || arg === "summary" || arg === "model") {
          ctx.setThinkingMode(arg);
          ctx.addSystemTimeline(`Thinking display → ${arg}`);
          return;
        }
        ctx.addSystemTimeline("Invalid thinking mode. Use off|summary|model.");
        return;
      }

      case "themes":
      case "theme": {
        const arg = args.trim();
        if (!arg) {
          ctx.addSystemTimeline(
            `Theme: ${ctx.themeName}\nAvailable: ${ctx.availableThemes.join(", ")}\nUsage: /theme <name>`,
          );
          return;
        }
        if (!ctx.availableThemes.includes(arg)) {
          ctx.addSystemTimeline(`Unknown theme: ${arg}\nAvailable: ${ctx.availableThemes.join(", ")}`);
          return;
        }
        ctx.setThemeName(arg);
        ctx.addSystemTimeline(`Theme → ${arg}`);
        return;
      }

      case "permissions": {
        ctx.showDrawer("policy");
        const policyPath = join(ctx.workspaceRoot, "policy.yaml");
        try {
          const raw = readFileSync(policyPath, "utf-8");
          const lines = raw.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).slice(0, 20);
          ctx.addSystemTimeline(`Policy (${policyPath}):\n${lines.join("\n")}`);
        } catch {
          ctx.addSystemTimeline("No policy.yaml — all actions require approval.");
        }
        return;
      }

      case "policy": {
        ctx.showDrawer("policy");
        ctx.addSystemTimeline("Policy posture → right panel");
        return;
      }

      case "approvals": {
        ctx.showDrawer("policy");
        ctx.addSystemTimeline("Pending approvals → policy panel");
        return;
      }

      case "audit": {
        ctx.showDrawer("trace");
        ctx.addSystemTimeline("Trace & audit → right panel");
        return;
      }

      case "auto-run": {
        const arg = args.trim().toLowerCase();
        if (arg === "on") {
          ctx.setAutoRun(true);
          ctx.addSystemTimeline("Auto-run ON — approvals auto-granted.");
        } else if (arg === "off") {
          ctx.setAutoRun(false);
          ctx.addSystemTimeline("Auto-run OFF — manual approval required.");
        } else {
          ctx.addSystemTimeline(`Auto-run: ${ctx.autoRun ? "on" : "off"}`);
        }
        return;
      }

      case "sandbox": {
        const policyPath = join(ctx.workspaceRoot, "policy.yaml");
        try {
          const raw = readFileSync(policyPath, "utf-8");
          const sandboxLines = raw.split("\n").filter((l) =>
            l.includes("sandbox") || l.includes("allow") || l.includes("deny"),
          );
          ctx.addSystemTimeline(
            sandboxLines.length > 0
              ? `Sandbox:\n${sandboxLines.join("\n")}`
              : "No sandbox rules in policy.yaml.",
          );
        } catch {
          ctx.addSystemTimeline("No policy.yaml — sandbox not configured.");
        }
        return;
      }

      case "mcp": {
        const arg = args.trim();
        if (!arg || arg === "status") {
          ctx.showDrawer("mcp");
          const healthy = ctx.mcpServers.filter((s) => s.healthy).length;
          ctx.addSystemTimeline(
            `MCP: ${healthy}/${ctx.mcpServers.length} servers, ${ctx.mcpToolCount} tools → right panel`,
          );
          return;
        }
        if (arg.startsWith("add ")) {
          const pkg = arg.slice(4).trim();
          if (!pkg) {
            ctx.addSystemTimeline("Usage: /mcp add <package>  e.g. /mcp add @modelcontextprotocol/server-memory");
            return;
          }
          ctx.addSystemTimeline(`MCP: adding ${pkg}…`);
          if (ctx.mcpAdd) {
            await ctx.mcpAdd(pkg);
          } else {
            ctx.addSystemTimeline("MCP hot-add not available — use: kirakira-agent mcp add " + pkg);
          }
          return;
        }
        if (arg === "refresh" || arg === "reload") {
          ctx.addSystemTimeline("MCP: refreshing tool cache…");
          if (ctx.mcpRefresh) {
            await ctx.mcpRefresh();
            ctx.addSystemTimeline("MCP: refresh done");
          }
          ctx.showDrawer("mcp");
          return;
        }
        if (arg === "list" || arg === "ls") {
          ctx.showDrawer("mcp");
          for (const s of ctx.mcpServers) {
            ctx.addSystemTimeline(`  ${s.healthy ? "✓" : "✗"} ${s.name}`);
          }
          return;
        }
        ctx.addSystemTimeline(
          "Usage: /mcp [status|add <pkg>|refresh|list]",
        );
        return;
      }

      case "skills": {
        ctx.showDrawer("skills");
        ctx.addSystemTimeline("Skills → right panel");
        return;
      }

      case "tasks": {
        ctx.showDrawer("tasks");
        const arg = args.trim();
        if (!arg) ctx.addSystemTimeline("Task graph → right panel");
        else ctx.addSystemTimeline(`/tasks ${arg} → handled in task panel`);
        return;
      }

      case "subagents": {
        ctx.showDrawer("subagents");
        const arg = args.trim();
        if (!arg) ctx.addSystemTimeline("Subagents → right panel");
        else ctx.addSystemTimeline(`/subagents ${arg} → handled in subagent panel`);
        return;
      }

      case "memory": {
        ctx.showDrawer("memory");
        const arg = args.trim();
        if (!arg) ctx.addSystemTimeline("Memory recalls → right panel");
        else ctx.addSystemTimeline(`/memory ${arg} → handled in memory panel`);
        return;
      }

      case "config": {
        const arg = args.trim().toLowerCase();
        if (arg === "setup" || arg === "model" || arg === "models" || arg === "provider" || arg === "llm") {
          if (ctx.openSetup) {
            ctx.openSetup();
            ctx.addSystemTimeline("Opening LLM provider setup.");
          } else {
            ctx.addSystemTimeline("LLM setup is not available in this mode.");
          }
          return;
        }
        ctx.showDrawer("config");
        ctx.addSystemTimeline("Config panel opened. Use /config setup to change provider, key, or model.");
        return;
      }

      case "commands": {
        const cmds = [
          "  chat        Interactive multi-turn chat (default)",
          "  preview     Show welcome/version info",
          "  config      Configuration management",
          "  skill       Skill management",
          "  mcp         MCP server management",
          "  session     Session management",
          "  plugin      Plugin management",
          "  registry    Package registry",
          "  trace       Trace inspection",
          "  eval        Evaluation",
          "  login       Authenticate",
          "  logout      Clear credentials",
        ];
        ctx.addSystemTimeline(`CLI commands:\n${cmds.join("\n")}`);
        return;
      }

      case "trace": {
        ctx.showDrawer("trace");
        ctx.addSystemTimeline(`Trace: ${ctx.session.traceId}\nSession: ${ctx.session.id}`);
        return;
      }

      case "export": {
        const fmt = (args.trim() || "md").toLowerCase();
        const stamp = Date.now();
        const base = join(
          ctx.workspaceRoot,
          `kirakira-export-${ctx.session.id.slice(0, 12)}-${stamp}`,
        );

        if (fmt === "json") {
          const payload = {
            exportedAt: nowIso(),
            sessionId: ctx.session.id,
            traceId: ctx.session.traceId,
            model: ctx.model,
            workspace: ctx.workspaceName,
            messages: ctx.messages,
          };
          const path = `${base}.json`;
          writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
          ctx.addSystemTimeline(`Exported → ${path}`);
        } else if (fmt === "jsonl") {
          let events: SessionEvent[];
          try {
            events = await readSessionEvents(ctx.session.id);
          } catch {
            events = [];
          }
          const path = `${base}.jsonl`;
          writeFileSync(path, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
          ctx.addSystemTimeline(`Exported → ${path}`);
        } else {
          const path = `${base}.md`;
          const header = `# Session export\n\n- Session: \`${ctx.session.id}\`\n- Model: \`${ctx.model}\`\n- Exported: ${nowIso()}\n\n---\n\n`;
          const body = ctx.messages.map((m) => `**${m.role}**\n\n${m.content}\n`).join("\n");
          writeFileSync(path, header + body, "utf8");
          ctx.addSystemTimeline(`Exported → ${path}`);
        }
        return;
      }

      case "vim": {
        ctx.setVimMode(!ctx.vimMode);
        ctx.addSystemTimeline(`Vim mode: ${!ctx.vimMode ? "on" : "off"}`);
        return;
      }

      case "setup-terminal": {
        const info = [
          `TERM: ${process.env.TERM ?? "unknown"}`,
          `COLORTERM: ${process.env.COLORTERM ?? "unknown"}`,
          `TTY: ${process.stdin.isTTY ? "yes" : "no"}`,
          `Size: ${process.stdout.columns ?? "?"}×${process.stdout.rows ?? "?"}`,
          `LANG: ${process.env.LANG ?? "unknown"}`,
        ];
        ctx.addSystemTimeline(`Terminal:\n${info.join("\n")}`);
        return;
      }

      case "usage": {
        let inT = 0;
        let outT = 0;
        try {
          const evs = await readSessionEvents(ctx.session.id);
          for (const e of evs) {
            if (
              (e.event === "response.complete" || e.event === "context.compact") &&
              e.data && typeof e.data === "object" && "usage" in e.data
            ) {
              const u = e.data.usage as { promptTokens?: number; completionTokens?: number };
              inT += u.promptTokens ?? 0;
              outT += u.completionTokens ?? 0;
            }
          }
        } catch {
          // session file may not exist
        }
        ctx.addSystemTimeline(`Tokens: ${inT} in + ${outT} out = ${inT + outT} total`);
        return;
      }

      case "about": {
        let version = "0.1.0";
        try {
          const pkgRaw = readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf-8");
          version = (JSON.parse(pkgRaw) as { version?: string }).version ?? "0.1.0";
        } catch {
          // fallback
        }
        ctx.addSystemTimeline(
          `kirakira-agent v${version}\nWorkspace: ${ctx.workspaceName}\nSession: ${ctx.session.id}\nTrust: ${ctx.trust}\nMode: ${ctx.mode}`,
        );
        return;
      }

      case "feedback": {
        ctx.addSystemTimeline(
          "Feedback:\n  GitHub: https://github.com/kirakira-agent/kirakira-agent/issues\n  Email: feedback@kirakira-agent.dev",
        );
        return;
      }

      default: {
        ctx.addSystemTimeline(`Unknown command: /${cmd} — type /help for available commands.`);
        return;
      }
    }
  }, [ctx]);

  return { handleSlash };
}
