/** Registry of known slash commands from the Kirakira CLI spec. */
export const SLASH_COMMANDS_ARRAY = [
  "help",
  "model",
  "plan",
  "ask",
  "new",
  "resume",
  "compact",
  "permissions",
  "auto-run",
  "sandbox",
  "mcp",
  "skills",
  "commands",
  "trace",
  "export",
  "vim",
  "setup-terminal",
  "usage",
  "about",
  "feedback",
  "quit",
  "exit",
] as const;

const KNOWN_SLASH = new Set<string>(SLASH_COMMANDS_ARRAY);

export interface SlashParseResult {
  command: string;
  args: string;
  recognized: boolean;
}

/**
 * Parse `/` prefixed commands. Only parses when the first character of input is `/`.
 */
export function parseSlashInput(input: string): SlashParseResult | null {
  if (input.length === 0 || input[0] !== "/") {
    return null;
  }

  const body = input.slice(1).trimStart();
  if (body.length === 0) {
    return { command: "", args: "", recognized: false };
  }

  const space = body.search(/\s/);
  const command = space === -1 ? body : body.slice(0, space);
  const args = space === -1 ? "" : body.slice(space).trimStart();

  return {
    command,
    args,
    recognized: KNOWN_SLASH.has(command),
  };
}
