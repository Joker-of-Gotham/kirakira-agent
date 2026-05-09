import type { ContextBundle } from "./context-fs.js";
import type { RetrievalTrace } from "./retrieval-trace.js";

export interface MemoryBundle {
  id: string;
  queryId: string;
  context: ContextBundle;
  trace: RetrievalTrace;
  recordIds: string[];
  totalTokens: number;
  createdAt: string;
}
