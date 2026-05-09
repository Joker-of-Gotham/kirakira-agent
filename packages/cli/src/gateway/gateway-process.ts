/**
 * Python model-gateway subprocess lifecycle management.
 *
 * Spawns the kirakira-model-gateway JSON-RPC stdio server as a child process,
 * monitors health, and supports restart / graceful shutdown.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { once, EventEmitter } from "node:events";

export interface GatewayProcessOptions {
  pythonBin?: string;
  gatewayModule?: string;
  env?: Record<string, string>;
  healthCheckIntervalMs?: number;
  startupTimeoutMs?: number;
}

export type GatewayState = "stopped" | "starting" | "running" | "error";

export class GatewayProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private _state: GatewayState = "stopped";
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private readonly opts: Required<GatewayProcessOptions>;

  constructor(options?: GatewayProcessOptions) {
    super();
    this.opts = {
      pythonBin: options?.pythonBin ?? "python3",
      gatewayModule: options?.gatewayModule ?? "kirakira_model_gateway.server",
      env: options?.env ?? {},
      healthCheckIntervalMs: options?.healthCheckIntervalMs ?? 30_000,
      startupTimeoutMs: options?.startupTimeoutMs ?? 10_000,
    };
  }

  get state(): GatewayState {
    return this._state;
  }

  get pid(): number | undefined {
    return this.proc?.pid;
  }

  async start(): Promise<void> {
    if (this.proc) {
      await this.stop();
    }

    this._state = "starting";
    this.emit("state", this._state);

    const env = {
      ...process.env,
      ...this.opts.env,
      PYTHONUNBUFFERED: "1",
    };

    this.proc = spawn(
      this.opts.pythonBin,
      ["-m", this.opts.gatewayModule],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true,
      },
    );

    this.proc.on("error", (err) => {
      this._state = "error";
      this.emit("state", this._state);
      this.emit("error", err);
    });

    this.proc.on("exit", (code, signal) => {
      this._state = "stopped";
      this.emit("state", this._state);
      this.emit("exit", code, signal);
      this.proc = null;
      this.stopHealthCheck();
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      this.emit("stderr", chunk.toString());
    });

    await this.waitForReady();
    this.startHealthCheck();
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = this.opts.startupTimeoutMs;
      const timer = setTimeout(() => {
        this._state = "error";
        this.emit("state", this._state);
        reject(new Error(`Gateway failed to become ready within ${timeout}ms`));
      }, timeout);

      const probe = async () => {
        if (!this.proc?.stdin || !this.proc?.stdout) {
          clearTimeout(timer);
          reject(new Error("Gateway process terminated during startup"));
          return;
        }
        try {
          const raw = await this.sendLine(
            JSON.stringify({ jsonrpc: "2.0", id: -1, method: "health", params: {} }),
          );
          const msg = JSON.parse(raw);
          if (msg?.result?.ok ?? false) {
            clearTimeout(timer);
            this._state = "running";
            this.emit("state", this._state);
            resolve();
            return;
          }
        } catch {
          // health probe not ready yet
        }
        setTimeout(probe, 200);
      };

      this.proc?.on("exit", () => {
        clearTimeout(timer);
        reject(new Error("Gateway process exited during startup"));
      });

      setTimeout(probe, 100);
    });
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (!this.proc) return;

    const proc = this.proc;
    const exitPromise = once(proc, "exit").catch(() => {});

    proc.stdin?.end();

    const killTimer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
    }, 5_000);

    try { proc.kill("SIGTERM"); } catch {}

    await exitPromise;
    clearTimeout(killTimer);
    this.proc = null;
    this._state = "stopped";
    this.emit("state", this._state);
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Send a raw JSON-RPC line to the gateway process stdin.
   * Returns the raw stdout line from the response.
   */
  sendLine(line: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin || !this.proc?.stdout) {
        return reject(new Error("Gateway process not running"));
      }

      let buffer = "";
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const nlIdx = buffer.indexOf("\n");
        if (nlIdx !== -1) {
          this.proc?.stdout?.removeListener("data", onData);
          const msg = buffer.slice(0, nlIdx).trim();
          if (msg) {
            resolve(msg);
          }
        }
      };
      this.proc.stdout.on("data", onData);

      try {
        this.proc.stdin.write(line + "\n");
      } catch (e) {
        this.proc.stdout.removeListener("data", onData);
        reject(e);
      }
    });
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    if (this.opts.healthCheckIntervalMs <= 0) return;

    this.healthTimer = setInterval(async () => {
      if (this._state !== "running" || !this.proc?.stdin || !this.proc?.stdout) {
        return;
      }
      try {
        const raw = await this.sendLine(
          JSON.stringify({ jsonrpc: "2.0", id: -1, method: "health", params: {} }),
        );
        const msg = JSON.parse(raw);
        const ok = msg?.result?.ok ?? false;
        this.emit("health", { ok, result: msg?.result });
        if (!ok) {
          this.emit("health-degraded", msg?.result);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        this.emit("health", { ok: false, error: `health probe failed: ${detail}` });
      }
    }, this.opts.healthCheckIntervalMs);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }
}
