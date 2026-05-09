/**
 * Token estimate: ~0.75 words per token for English (rough heuristic).
 */
export function estimateTokensSync(text: string): number {
  const words = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

/** When the optional `tiktoken` package is installed, uses model encoding; otherwise falls back to {@link estimateTokensSync}. */
export async function estimateTokens(text: string): Promise<number> {
  try {
    const mod = (await import("tiktoken")) as {
      encodingForModel?: (model: string) => { encode: (t: string) => unknown; free?: () => void };
    };
    if (typeof mod.encodingForModel === "function") {
      const enc = mod.encodingForModel("gpt-4o-mini");
      const out = enc.encode(text);
      const len = typeof (out as { length: number }).length === "number" ? (out as { length: number }).length : 0;
      enc.free?.();
      if (len > 0) return len;
    }
  } catch {
    /* optional dependency */
  }
  return estimateTokensSync(text);
}
