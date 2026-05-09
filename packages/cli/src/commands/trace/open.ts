import { Command, Flags } from "@oclif/core";
import { exec } from "node:child_process";
import { platform } from "node:os";

export interface TraceOpenOptions {
  trace?: string;
  backend: "jaeger" | "grafana" | "langsmith" | "langfuse" | "phoenix";
  port?: number;
}

export async function traceOpen(options: TraceOpenOptions): Promise<void> {
  const backendUrls: Record<string, string> = {
    jaeger: `http://localhost:${options.port ?? 16686}`,
    grafana: `http://localhost:${options.port ?? 3000}`,
    langsmith: "https://smith.langchain.com",
    langfuse: `http://localhost:${options.port ?? 3000}`,
    phoenix: `http://localhost:${options.port ?? 6006}`,
  };

  const baseUrl: string =
    backendUrls[options.backend] ??
    backendUrls.jaeger ??
    `http://localhost:${options.port ?? 16686}`;
  let url = baseUrl;

  if (options.trace) {
    switch (options.backend) {
      case "jaeger":
        url = `${baseUrl}/trace/${options.trace}`;
        break;
      case "grafana":
        url = `${baseUrl}/explore?left=["now-1h","now","Tempo",{"query":"${options.trace}"}]`;
        break;
      default:
        url = `${baseUrl}/traces/${options.trace}`;
    }
  }

  console.log(`Opening ${options.backend} at: ${url}`);

  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url.replace(/"/g, '\\"')}"`);
}

export default class TraceOpen extends Command {
  static override description = "Open tracing UI for a backend (local or hosted)";

  static override flags = {
    trace: Flags.string({ description: "Optional trace id to deep-link" }),
    backend: Flags.string({
      description: "Tracing backend UI",
      options: ["jaeger", "grafana", "langsmith", "langfuse", "phoenix"],
      default: "jaeger",
    }),
    port: Flags.integer({ description: "Override default HTTP port for local backends" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TraceOpen);
    await traceOpen({
      ...(flags.trace !== undefined ? { trace: flags.trace } : {}),
      backend: flags.backend as TraceOpenOptions["backend"],
      ...(flags.port !== undefined ? { port: flags.port } : {}),
    });
  }
}
