export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
}

const defaultOpts: Required<BackoffOptions> = {
  baseDelayMs: 250,
  maxDelayMs: 60_000,
  jitterFactor: 0.2,
};

/**
 * Computes exponential backoff with jitter for attempt `n` (0-based: first retry uses n=1 after first failure).
 */
export function calculateBackoffDelayMs(attemptsAfterIncrement: number, options?: BackoffOptions): number {
  const o = { ...defaultOpts, ...options };
  const exp = Math.min(o.maxDelayMs, o.baseDelayMs * 2 ** Math.max(0, attemptsAfterIncrement - 1));
  const jitter = o.jitterFactor <= 0 ? 0 : exp * o.jitterFactor * (Math.random() * 2 - 1);
  const out = Math.max(0, Math.round(exp + jitter));
  return Math.min(o.maxDelayMs, out);
}
