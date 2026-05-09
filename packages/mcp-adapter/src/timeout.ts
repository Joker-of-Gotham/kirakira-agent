/**
 * Wrap a promise with a timeout. Rejects with `Error` if time elapses first.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function getTimeoutMs(
  timeouts: { startupSec?: number; toolSec?: number } | undefined,
  kind: "startup" | "tool",
  fallbacks: { startupSec: number; toolSec: number },
): number {
  const sec =
    kind === "startup"
      ? (timeouts?.startupSec ?? fallbacks.startupSec)
      : (timeouts?.toolSec ?? fallbacks.toolSec);
  return Math.round(sec * 1000);
}
