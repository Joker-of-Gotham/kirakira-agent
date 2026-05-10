import React from "react";
import { Text } from "ink";
import type { TuiTheme } from "./theme.js";
import { useTicker } from "./hooks/useTicker.js";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "tool" | "reasoning";

function unicodeEnabled(): boolean {
  if (process.env.KIRAKIRA_TUI_ASCII === "1" || process.env.KIRAKIRA_TUI_UNICODE === "0") return false;
  if (process.env.KIRAKIRA_TUI_UNICODE === "1") return true;
  return process.platform !== "win32";
}

function toneColor(theme: TuiTheme, tone: Tone): string {
  if (tone === "info") return theme.colors.info;
  if (tone === "success") return theme.colors.success;
  if (tone === "warning") return theme.colors.warning;
  if (tone === "danger") return theme.colors.danger;
  if (tone === "tool") return theme.colors.tool;
  if (tone === "reasoning") return theme.colors.reasoning;
  return theme.colors.textSecondary;
}

export function Spinner({
  active = true,
  color,
  label,
  intervalMs = 120,
}: {
  active?: boolean;
  color: string;
  label?: string;
  intervalMs?: number;
}): React.ReactElement {
  const tick = useTicker(active, intervalMs);
  const frames = unicodeEnabled()
    ? ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"]
    : ["-", "\\", "|", "/"];
  const frame = active ? frames[tick % frames.length] ?? frames[0] ?? "" : frames[0] ?? "";

  return (
    <Text color={color}>
      {frame}{label ? ` ${label}` : ""}
    </Text>
  );
}

export function AnimatedDots({
  active = true,
  color,
}: {
  active?: boolean;
  color: string;
}): React.ReactElement {
  const tick = useTicker(active, 260);
  const dots = ".".repeat((tick % 3) + 1).padEnd(3, " ");
  return <Text color={color}>{dots}</Text>;
}

function makeProgress(value: number, total: number, width: number): string {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, value / safeTotal));

  if (!unicodeEnabled()) {
    const filled = Math.round(ratio * width);
    return `${"=".repeat(filled)}${".".repeat(Math.max(0, width - filled))}`;
  }

  const partialBlocks = ["", "\u258f", "\u258e", "\u258d", "\u258c", "\u258b", "\u258a", "\u2589"];
  const units = Math.round(ratio * width * 8);
  const full = Math.floor(units / 8);
  const partial = units % 8;
  const empty = Math.max(0, width - full - (partial > 0 ? 1 : 0));
  return `${"\u2588".repeat(full)}${partialBlocks[partial] ?? ""}${" ".repeat(empty)}`;
}

export function ProgressBar({
  value,
  total,
  width = 14,
  theme,
  tone = "info",
}: {
  value: number;
  total: number;
  width?: number;
  theme: TuiTheme;
  tone?: Tone;
}): React.ReactElement {
  return (
    <Text color={toneColor(theme, tone)}>
      {makeProgress(value, total, width)}
    </Text>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
  theme,
}: {
  label: string;
  tone?: Tone;
  theme: TuiTheme;
}): React.ReactElement {
  const color = toneColor(theme, tone);
  return (
    <Text color={color} bold>[{label}]</Text>
  );
}
