import type { Attachment } from "./mention.js";
import { parseMentions } from "./mention.js";
import type { ShellParseResult } from "./shell.js";
import { parseShellInput } from "./shell.js";
import type { SlashParseResult } from "./slash.js";
import { parseSlashInput } from "./slash.js";

export type InputEvent =
  | { type: "slash"; result: SlashParseResult }
  | { type: "mention"; mentions: Attachment[]; remainder?: string }
  | { type: "shell"; result: ShellParseResult }
  | { type: "prompt"; text: string };

/**
 * Route raw REPL/exec input by leading prefix after optional leading whitespace.
 */
export function routeInput(raw: string): InputEvent {
  const lead = raw.replace(/^\s+/, "");

  if (lead.startsWith("/")) {
    const r = parseSlashInput(lead);
    if (r) return { type: "slash", result: r };
  }

  if (lead.startsWith("!")) {
    const r = parseShellInput(lead);
    if (r) return { type: "shell", result: r };
  }

  if (lead.startsWith("@")) {
    const mentions = parseMentions(lead);
    return { type: "mention", mentions, remainder: lead };
  }

  return { type: "prompt", text: raw };
}
