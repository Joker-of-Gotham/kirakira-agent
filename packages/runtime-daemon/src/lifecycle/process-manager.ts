import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

export interface ChildProcessHandle {
  name: string;
  command: string;
  args: string[];
  get pid(): number | undefined;
  get child(): ChildProcess;
}

export interface ProcessInfo {
  name: string;
  command: string;
  args: string[];
  pid: number | undefined;
  state: "running" | "stopped";
  restarts: number;
}

interface ManagedProcess {
  command: string;
  args: string[];
  child: ChildProcess | null;
  state: "running" | "stopped";
  restarts: number;
  manualStop: boolean;
  env: Record<string, string> | undefined;
  start: () => void;
}

export class ProcessManager {
  private readonly procs = new Map<string, ManagedProcess>();

  spawn(
    name: string,
    command: string,
    args: string[],
    options?: {
      env?: Record<string, string>;
      onRestart?: (name: string, attempt: number) => void;
      backoffMs?: (attempt: number) => number;
    },
  ): ChildProcessHandle {
    if (this.procs.has(name)) {
      const cur = this.procs.get(name);
      if (cur?.state === "running") {
        throw new Error(`Process "${name}" already running`);
      }
    }
    const managed: ManagedProcess = {
      command,
      args,
      child: null,
      state: "stopped",
      restarts: 0,
      manualStop: false,
      env: options?.env,
      start: () => {
        /* set below */
      },
    };
    managed.start = () => {
      if (managed.manualStop) return;
      const child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...managed.env },
        windowsHide: true,
      });
      managed.child = child;
      managed.state = "running";
      child.on("exit", () => {
        if (managed.manualStop) {
          managed.state = "stopped";
          return;
        }
        managed.state = "stopped";
        managed.restarts += 1;
        options?.onRestart?.(name, managed.restarts);
        const delay =
          options?.backoffMs?.(managed.restarts) ??
          Math.min(30_000, 500 * 2 ** Math.min(managed.restarts, 8));
        const t = setTimeout(() => {
          managed.start();
        }, delay);
        t.unref?.();
      });
      child.on("error", () => {
        /* ignore */
      });
    };
    this.procs.set(name, managed);
    managed.start();
    const self = this;
    return {
      name,
      command,
      args,
      get pid(): number | undefined {
        return self.procs.get(name)?.child?.pid;
      },
      get child(): ChildProcess {
        const c = self.procs.get(name)?.child;
        if (!c) throw new Error(`Process "${name}" not running`);
        return c;
      },
    };
  }

  getChildProcess(name: string): ChildProcess | null {
    return this.procs.get(name)?.child ?? null;
  }

  async kill(name: string): Promise<void> {
    const m = this.procs.get(name);
    if (!m?.child) {
      this.procs.delete(name);
      return;
    }
    m.manualStop = true;
    const proc = m.child;
    const done = new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
    });
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 8000);
    await done;
    clearTimeout(t);
    m.child = null;
    m.state = "stopped";
    this.procs.delete(name);
  }

  async restart(name: string): Promise<void> {
    const m = this.procs.get(name);
    if (!m) return;
    const command = m.command;
    const args = m.args;
    const env = m.env;
    await this.kill(name);
    this.spawn(name, command, args, { env });
  }

  listProcesses(): ProcessInfo[] {
    return [...this.procs.entries()].map(([name, m]) => ({
      name,
      command: m.command,
      args: m.args,
      pid: m.child?.pid,
      state: m.state,
      restarts: m.restarts,
    }));
  }
}
