import { useState, useCallback, useRef } from "react";
import {
  chatCompleteMultiTurnStream,
} from "../../gateway/openai-complete.js";
import type { ProviderConfig } from "../../gateway/openai-complete.js";
import type { ActiveToolRun, TimelineEntry } from "../types.js";
import type { McpToolDescriptor } from "./useMcp.js";
import {
  buildToolSystemPrompt,
  parseToolCalls,
  hasToolCalls,
  stripToolCalls,
  formatToolResult,
} from "../tool-prompt.js";

let entrySeq = 0;
function nextId(): string {
  return `evt_${Date.now()}_${++entrySeq}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

interface UseChatOptions {
  providerConfig?: ProviderConfig;
  tools?: readonly McpToolDescriptor[];
  workspaceRoot?: string;
  callTool?: (
    alias: string,
    args: Record<string, unknown>,
  ) => Promise<{ ok: boolean; content: unknown; latencyMs: number; error?: string }>;
}

export interface ChatSnapshot {
  messages: Array<{ role: string; content: string }>;
  timeline: TimelineEntry[];
}

interface UseChatReturn {
  messages: Array<{ role: string; content: string }>;
  timeline: TimelineEntry[];
  thinking: boolean;
  thinkingText: string;
  streamingContent: string;
  activeTool: ActiveToolRun | null;
  sendChat: (text: string, model: string) => Promise<{
    ok: boolean;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>;
  compact: (model: string) => Promise<void>;
  clearHistory: () => void;
  addSystemTimeline: (text: string) => void;
  addTimelineEntry: (entry: TimelineEntry) => void;
  restoreMessages: (msgs: Array<{ role: string; content: string }>) => void;
  snapshot: () => ChatSnapshot;
  restoreSnapshot: (snap: ChatSnapshot) => void;
}

const MAX_TOOL_ROUNDS = 10;
const TOOL_PREVIEW_LENGTH = 2000;

function previewValue(value: unknown, max = TOOL_PREVIEW_LENGTH): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (raw ?? "")
    .trim()
    .slice(0, max);
}

export function useChat(options?: UseChatOptions): UseChatReturn {
  const providerRef = useRef(options?.providerConfig);
  providerRef.current = options?.providerConfig;
  const toolsRef = useRef(options?.tools);
  toolsRef.current = options?.tools;
  const callToolRef = useRef(options?.callTool);
  callToolRef.current = options?.callTool;
  const workspaceRootRef = useRef(options?.workspaceRoot);
  workspaceRootRef.current = options?.workspaceRoot;

  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [activeTool, setActiveTool] = useState<ActiveToolRun | null>(null);

  const addTimelineEntry = useCallback((entry: TimelineEntry) => {
    setTimeline((prev) => [...prev, entry]);
  }, []);

  const addSystemTimeline = useCallback((text: string) => {
    setTimeline((prev) => [
      ...prev,
      { id: nextId(), ts: nowIso(), kind: "system", text },
    ]);
  }, []);

  const sendChat = useCallback(async (text: string, model: string) => {
    const tools = toolsRef.current ?? [];
    const callTool = callToolRef.current;
    const wsRoot = workspaceRootRef.current ?? ".";

    const toolSystemPrompt = tools.length > 0
      ? buildToolSystemPrompt(tools, wsRoot)
      : "";

    const baseMessages = [...messages];

    if (toolSystemPrompt && !baseMessages.some((m) => m.role === "system" && m.content.includes("Available Tools"))) {
      baseMessages.unshift({ role: "system", content: toolSystemPrompt });
    }

    const newMessages = [...baseMessages, { role: "user", content: text }];
    setMessages(newMessages);
    setTimeline((prev) => [
      ...prev,
      { id: nextId(), ts: nowIso(), kind: "user", text },
    ]);
    setThinking(true);
    setThinkingText("");
    setStreamingContent("");
    setActiveTool(null);

    let currentMessages = newMessages;
    let finalUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
    let round = 0;

    try {
      while (round < MAX_TOOL_ROUNDS) {
        round++;
        let roundThinking = "";

        const result = await chatCompleteMultiTurnStream(
          {
            messages: currentMessages,
            model,
            temperature: 0.2,
            maxTokens: 4096,
            provider: providerRef.current,
          },
          {
            onThinking(chunk) {
              roundThinking += chunk;
              setThinkingText((prev) => prev + chunk);
            },
            onContent(chunk) {
              setStreamingContent((prev) => prev + chunk);
            },
          },
        );

        finalUsage = result.usage;

        if (roundThinking.trim()) {
          setTimeline((prev) => [
            ...prev,
            {
              id: nextId(),
              ts: nowIso(),
              kind: "thinking",
              text: roundThinking.trim(),
            },
          ]);
        }

        if (!callTool || !hasToolCalls(result.text)) {
          const proseText = stripToolCalls(result.text) || result.text;
          currentMessages = [...currentMessages, { role: "assistant", content: result.text }];
          setMessages(currentMessages);
          setTimeline((prev) => [
            ...prev,
            { id: nextId(), ts: nowIso(), kind: "agent", text: proseText },
          ]);
          break;
        }

        const toolCalls = parseToolCalls(result.text);
        const prose = stripToolCalls(result.text);
        if (prose) {
          setTimeline((prev) => [
            ...prev,
            { id: nextId(), ts: nowIso(), kind: "agent", text: prose },
          ]);
        }

        currentMessages = [...currentMessages, { role: "assistant", content: result.text }];

        const resultParts: string[] = [];
        for (const tc of toolCalls) {
          const toolRun: ActiveToolRun = {
            id: nextId(),
            name: tc.name,
            argsPreview: JSON.stringify(tc.arguments).slice(0, TOOL_PREVIEW_LENGTH),
            startedAt: Date.now(),
            status: "running",
          };
          setActiveTool(toolRun);
          setTimeline((prev) => [
            ...prev,
            {
              id: toolRun.id,
              ts: nowIso(),
              kind: "tool_call",
              text: `call ${tc.name} ${toolRun.argsPreview}`,
            },
          ]);

          const tcResult = await callTool(tc.name, tc.arguments);
          setActiveTool({
            ...toolRun,
            status: tcResult.ok ? "completed" : "failed",
            latencyMs: tcResult.latencyMs,
            error: tcResult.error,
          });

          setTimeline((prev) => [
            ...prev,
            {
              id: nextId(),
              ts: nowIso(),
              kind: "tool_result",
              text: tcResult.ok
                ? `done ${tc.name} ${tcResult.latencyMs}ms ${previewValue(tcResult.content)}`
                : `fail ${tc.name}: ${tcResult.error ?? "error"}`,
            },
          ]);

          resultParts.push(formatToolResult(tc.name, tcResult));
        }

        const toolResultMsg = resultParts.join("\n\n");
        currentMessages = [...currentMessages, { role: "user", content: toolResultMsg }];
        setMessages(currentMessages);

        setStreamingContent("");
        setThinkingText("");
      }

      setThinking(false);
      setThinkingText("");
      setStreamingContent("");
      setActiveTool(null);
      return { ok: true, usage: finalUsage };
    } catch (e) {
      setMessages((prev) => prev.slice(0, messages.length));
      const msg = e instanceof Error ? e.message : String(e);
      setTimeline((prev) => [
        ...prev,
        { id: nextId(), ts: nowIso(), kind: "error", text: msg },
      ]);
      setThinking(false);
      setThinkingText("");
      setStreamingContent("");
      setActiveTool(null);
      return { ok: false };
    }
  }, [messages]);

  const compact = useCallback(async (model: string) => {
    if (messages.length === 0) return;
    const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    setThinking(true);
    setThinkingText("");
    setStreamingContent("");
    setActiveTool(null);
    try {
      const result = await chatCompleteMultiTurnStream(
        {
          messages: [
            {
              role: "user",
              content:
                "Summarize the following conversation concisely for context compression. Preserve key facts, decisions, and open questions. Output only the summary, no preamble.\n\n" +
                transcript,
            },
          ],
          model,
          temperature: 0.2,
          maxTokens: 2048,
          provider: providerRef.current,
        },
        {
          onThinking(chunk) {
            setThinkingText((prev) => prev + chunk);
          },
          onContent() { /* compact discards streaming content */ },
        },
      );
      setMessages([{ role: "system", content: "Compressed prior conversation summary:\n" + result.text }]);
      addSystemTimeline(`History compressed (${result.text.length} chars in summary).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addSystemTimeline(`Compact failed: ${msg}`);
    }
    setThinking(false);
    setThinkingText("");
    setStreamingContent("");
    setActiveTool(null);
  }, [messages, addSystemTimeline]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setTimeline([]);
    setActiveTool(null);
  }, []);

  const restoreMessages = useCallback((msgs: Array<{ role: string; content: string }>) => {
    setMessages(msgs);
    const entries: TimelineEntry[] = msgs.map((m) => ({
      id: nextId(),
      ts: nowIso(),
      kind: m.role === "user" ? "user" : m.role === "assistant" ? "agent" : "system",
      text: m.content,
    }));
    setTimeline(entries);
    setActiveTool(null);
  }, []);

  const snapshot = useCallback((): ChatSnapshot => ({
    messages: messages.map((m) => ({ ...m })),
    timeline: timeline.map((t) => ({ ...t })),
  }), [messages, timeline]);

  const restoreSnapshot = useCallback((snap: ChatSnapshot): void => {
    setMessages(snap.messages.map((m) => ({ ...m })));
    setTimeline(snap.timeline.map((t) => ({ ...t })));
    setThinking(false);
    setThinkingText("");
    setStreamingContent("");
    setActiveTool(null);
  }, []);

  return {
    messages,
    timeline,
    thinking,
    thinkingText,
    streamingContent,
    activeTool,
    sendChat,
    compact,
    clearHistory,
    addSystemTimeline,
    addTimelineEntry,
    restoreMessages,
    snapshot,
    restoreSnapshot,
  };
}
