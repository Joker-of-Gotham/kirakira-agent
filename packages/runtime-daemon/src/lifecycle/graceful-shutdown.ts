import type { DaemonLifecycle } from "./daemon-lifecycle.js";

export function registerShutdownHandlers(
  daemon: DaemonLifecycle,
  options?: { timeoutMs?: number },
): void {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const shutdown = (): void => {
    void (async () => {
      const t = setTimeout(() => {
        process.exit(1);
      }, timeoutMs);
      t.unref?.();
      try {
        await daemon.stop();
        clearTimeout(t);
        process.exit(0);
      } catch {
        clearTimeout(t);
        process.exit(1);
      }
    })();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGHUP", shutdown);
}
