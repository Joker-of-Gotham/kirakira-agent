export interface ContentCaptureConfig {
  enabled: boolean;
  capturePrompt: boolean;
  captureResponse: boolean;
  captureToolArgs: boolean;
}

/**
 * Defaults: explicit opt-in capture off; callers enable via obligations or overrides.
 */
export function getContentCaptureConfig(): ContentCaptureConfig {
  return {
    enabled: false,
    capturePrompt: false,
    captureResponse: false,
    captureToolArgs: false,
  };
}

/** When obligation `trace_redaction` carries {@code policy: "full_content"}, capture prompts + completions + args. */
export function shouldCaptureContent(
  config: ContentCaptureConfig,
  obligationPolicy?: string,
): boolean {
  const policy = obligationPolicy?.trim().toLowerCase();
  if (policy === "full_content") return true;
  if (!config.enabled) return false;
  return config.capturePrompt || config.captureResponse || config.captureToolArgs;
}
