/**
 * Builds tool schema sections for the system prompt and
 * parses <tool_call> blocks from the model's text output.
 *
 * Works with any LLM (text-based tool calling).
 */

import type { McpToolDescriptor } from "./hooks/useMcp.js";

/* ------------------------------------------------------------------ */
/*  System prompt: tool schema injection                               */
/* ------------------------------------------------------------------ */

export function buildToolSystemPrompt(
  tools: readonly McpToolDescriptor[],
  workspaceRoot: string,
): string {
  if (tools.length === 0) return "";

  const sections = tools.map((t) => {
    const params = t.inputSchema
      ? JSON.stringify(t.inputSchema, null, 2)
      : "{}";
    return `### ${t.alias}
Description: ${t.description}
Server: ${t.server}
Risk: ${t.riskLevel}
Parameters:
\`\`\`json
${params}
\`\`\``;
  });

  return `
# Available Tools

You have access to the following tools via MCP (Model Context Protocol).
The workspace root is: ${workspaceRoot}

To call a tool, output a <tool_call> block:
<tool_call>
{"name": "tool_alias", "arguments": {"param1": "value1"}}
</tool_call>

You can make multiple tool calls in a single response. Each call should be in its own <tool_call> block.
After the tool executes, the result will be provided to you in a <tool_result> block.

## Tool List (${tools.length} tools)

${sections.join("\n\n")}

# Important Rules
- Always use absolute paths based on the workspace root: ${workspaceRoot}
- For file reading, use the fs.read_text tool
- For directory listing, use the fs.list_dir tool
- For text search, use the fs.grep tool
- You CAN and SHOULD use tools to read, search, and manipulate files
- Do NOT say you cannot access local files — you have full filesystem access through MCP tools
`.trim();
}

/* ------------------------------------------------------------------ */
/*  Tool call parser                                                   */
/* ------------------------------------------------------------------ */

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  raw: string;
}

const TOOL_CALL_REGEX = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

export function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(TOOL_CALL_REGEX.source, TOOL_CALL_REGEX.flags);

  while ((match = re.exec(text)) !== null) {
    const raw = match[1]!.trim();
    try {
      const parsed = JSON.parse(raw) as { name?: string; arguments?: Record<string, unknown> };
      if (parsed.name && typeof parsed.name === "string") {
        calls.push({
          name: parsed.name,
          arguments: parsed.arguments ?? {},
          raw,
        });
      }
    } catch {
      // skip malformed tool calls
    }
  }

  return calls;
}

export function hasToolCalls(text: string): boolean {
  return /<tool_call>/.test(text);
}

/**
 * Strip tool_call blocks from the text to get the "prose" part only.
 */
export function stripToolCalls(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}

/**
 * Format a tool result for injection back into the conversation.
 */
export function formatToolResult(
  name: string,
  result: { ok: boolean; content: unknown; error?: string },
): string {
  if (!result.ok) {
    return `<tool_result name="${name}" status="error">
${result.error ?? "Unknown error"}
</tool_result>`;
  }

  let contentStr: string;
  if (typeof result.content === "string") {
    contentStr = result.content;
  } else {
    try {
      contentStr = JSON.stringify(result.content, null, 2);
    } catch {
      contentStr = String(result.content);
    }
  }

  const MAX_RESULT_CHARS = 50_000;
  if (contentStr.length > MAX_RESULT_CHARS) {
    contentStr = contentStr.slice(0, MAX_RESULT_CHARS) + "\n... [truncated]";
  }

  return `<tool_result name="${name}" status="ok">
${contentStr}
</tool_result>`;
}
