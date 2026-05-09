import type { SecurityFinding } from "./security-scanner.js";

/** Build a human-readable trust review block from security findings. */
export function formatTrustPrompt(findings: readonly SecurityFinding[]): string {
  if (!findings.length) {
    return "No notable security signals were detected in the imported configuration.";
  }
  const lines = findings.map(
    (f) => `- [${f.severity.toUpperCase()}] ${f.message}${f.path ? ` (${f.path})` : ""}`,
  );
  return [
    "Review the following before trusting imported skills or MCP servers:",
    ...lines,
    "",
    "Only proceed if you understand each item and accept the risk.",
  ].join("\n");
}
