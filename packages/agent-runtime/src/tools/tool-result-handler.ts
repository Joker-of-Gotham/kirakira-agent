import type { ArtifactStore } from "../sandbox/artifact-store.js";
import type { ProcessedResult, ToolResult, Workspace } from "../types.js";

const INLINE_MAX = 24_000;

export function handleToolResult(
  result: ToolResult,
  workspace: Workspace,
  store?: ArtifactStore,
): ProcessedResult {
  const refs = [...(result.artifactRefs ?? [])];
  let content = result.success ? result.output : `ERROR: ${result.error ?? "unknown"}`;
  let truncated = false;

  if (workspace.rootPath && content.includes(workspace.rootPath)) {
    content = content.replaceAll(workspace.rootPath, ".");
  }

  if (content.length > INLINE_MAX && store) {
    const art = store.create("tool-output.txt", content, "text/plain");
    refs.push(art.id);
    content = `Large output stored as artifact ${art.id} (${art.size} bytes).`;
    truncated = true;
  } else if (content.length > INLINE_MAX) {
    content = `${content.slice(0, INLINE_MAX)}\n… [truncated]`;
    truncated = true;
  }
  return { content, artifactRefs: refs, truncated };
}
