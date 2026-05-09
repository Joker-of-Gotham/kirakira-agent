export type ShellParseVariant =
  | { variant: "toggle" }
  | { variant: "repeat_last" }
  | { variant: "host"; command: string; needsApproval: true }
  | { variant: "oneshot"; command: string; needsApproval: boolean };

export interface ShellParseResult {
  raw: string;
  variant: ShellParseVariant;
}

/**
 * Parse `!` shell input.
 * - `!` alone → toggle shell mode
 * - `!!` → repeat last shell command (handled by caller via history)
 * - `! --host cmd` → host execution (requires strong approval)
 * - `!command` → one-shot shell in workspace sandbox context
 */
export function parseShellInput(input: string): ShellParseResult | null {
  if (input.length === 0 || input[0] !== "!") {
    return null;
  }

  if (input === "!") {
    return { raw: input, variant: { variant: "toggle" } };
  }

  if (input === "!!") {
    return { raw: input, variant: { variant: "repeat_last" } };
  }

  const rest = input.slice(1);
  const trimmed = rest.trimStart();

  if (trimmed.startsWith("--host")) {
    const after = trimmed.slice("--host".length).trimStart();
    return {
      raw: input,
      variant: {
        variant: "host",
        command: after,
        needsApproval: true,
      },
    };
  }

  const command = rest.startsWith(" ") ? rest.trimStart() : rest;
  return {
    raw: input,
    variant: {
      variant: "oneshot",
      command,
      needsApproval: false,
    },
  };
}
