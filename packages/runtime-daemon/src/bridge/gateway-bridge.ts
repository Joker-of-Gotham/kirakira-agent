import type { ProcessManager } from "../lifecycle/process-manager.js";

const GATEWAY_PROCESS = "model-gateway";

export interface GatewayBridgeOptions {
  disabled?: boolean;
  pythonBin?: string;
  gatewayModule?: string;
  env?: Record<string, string>;
  healthIntervalMs?: number;
}

export class GatewayBridge {
  private readonly processes: ProcessManager;
  private readonly opts: Required<
    Pick<
      GatewayBridgeOptions,
      "disabled" | "pythonBin" | "gatewayModule" | "healthIntervalMs"
    >
  > & { env?: Record<string, string> };
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(processes: ProcessManager, options?: GatewayBridgeOptions) {
    this.processes = processes;
    this.opts = {
      disabled: options?.disabled ?? false,
      pythonBin: options?.pythonBin ?? "python3",
      gatewayModule: options?.gatewayModule ?? "kirakira_model_gateway.server",
      env: options?.env,
      healthIntervalMs: options?.healthIntervalMs ?? 30_000,
    };
  }

  async start(): Promise<void> {
    if (this.opts.disabled) return;
    this.processes.spawn(GATEWAY_PROCESS, this.opts.pythonBin, ["-m", this.opts.gatewayModule], {
      env: { PYTHONUNBUFFERED: "1", ...this.opts.env },
    });
    if ((this.opts.healthIntervalMs ?? 0) > 0) {
      this.healthTimer = setInterval(() => {
        void this.isHealthy();
      }, this.opts.healthIntervalMs);
    }
  }

  async stop(): Promise<void> {
    if (this.opts.disabled) return;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    await this.processes.kill(GATEWAY_PROCESS);
  }

  async isHealthy(): Promise<boolean> {
    if (this.opts.disabled) return false;
    const proc = this.processes.getChildProcess(GATEWAY_PROCESS);
    const stdin = proc?.stdin;
    const stdout = proc?.stdout;
    if (!stdin || !stdout) return false;
    try {
      const line = JSON.stringify({
        jsonrpc: "2.0",
        id: -1,
        method: "health",
        params: {},
      });
      const raw = await new Promise<string>((resolve, reject) => {
        let buffer = "";
        let settled = false;
        let to: ReturnType<typeof setTimeout> | undefined;
        const cleanup = (): void => {
          stdout.removeListener("data", onData);
          stdout.removeListener("error", onError);
          setImmediate(() => {
            stdin.removeListener("error", onError);
          });
          if (to) clearTimeout(to);
        };
        const fail = (error: unknown): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };
        const done = (value: string): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };
        const onError = (error: Error): void => {
          fail(error);
        };
        const onData = (chunk: Buffer | string): void => {
          buffer += chunk.toString();
          const nl = buffer.indexOf("\n");
          if (nl !== -1) {
            done(buffer.slice(0, nl).trim());
          }
        };
        stdout.on("data", onData);
        stdout.once("error", onError);
        stdin.on("error", onError);
        try {
          stdin.write(`${line}\n`, (error) => {
            if (error) fail(error);
          });
        } catch (e) {
          fail(e);
        }
        to = setTimeout(() => {
          fail(new Error("Gateway health RPC timeout"));
        }, 5000);
        to.unref?.();
      });
      const msg: unknown = JSON.parse(raw);
      return (
        typeof msg === "object" &&
        msg !== null &&
        "result" in msg &&
        typeof (msg as { result?: { ok?: boolean } }).result?.ok === "boolean" &&
        (msg as { result: { ok: boolean } }).result.ok === true
      );
    } catch {
      return false;
    }
  }

  async restart(): Promise<void> {
    if (this.opts.disabled) return;
    await this.processes.restart(GATEWAY_PROCESS);
  }
}
