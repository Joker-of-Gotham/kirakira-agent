import React, { useMemo } from "react";
import { Text } from "ink";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
marked.setOptions({ renderer: new (TerminalRenderer as any)({
  reflowText: false,
  showSectionPrefix: false,
  tab: 2,
}) });

export function renderMarkdownToAnsi(text: string): string {
  try {
    const raw = marked.parse(text) as string;
    return raw.replace(/\n{3,}/g, "\n\n").trimEnd();
  } catch {
    return text;
  }
}

export function MarkdownText({ text }: { text: string }): React.ReactElement {
  const rendered = useMemo(() => renderMarkdownToAnsi(text), [text]);
  return <Text>{rendered}</Text>;
}
