import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditEntry } from "@kirakira/core";
import { getUserTracesDir } from "@kirakira/core";

export function defaultAuditLogPath(): string {
  return `${getUserTracesDir()}/audit.jsonl`;
}

export async function appendAuditEntry(
  entry: AuditEntry,
  filePath?: string,
): Promise<void> {
  const target = filePath ?? defaultAuditLogPath();
  await mkdir(dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(entry)}\n`, "utf8");
}
