import {
  listArtifacts,
  readArtifactMeta,
  readArtifactPreview,
  writeArtifact,
} from "./artifact.js";
import { hashFile } from "./hash.js";
import { inspectBinary, previewStructured } from "./inspect.js";

export type ArtifactServerOptions = {
  workspaceRoot: string;
};

export function encodeJsonRpcMessage(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload) + "\n", "utf8");
}

class HybridJsonRpcFramer {
  private buf = Buffer.alloc(0);
  private mode: "ndjson" | "content-length" | null = null;

  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    if (this.mode === null) {
      const peek = this.buf.toString("utf8", 0, Math.min(this.buf.length, 32));
      if (/^Content-Length:/i.test(peek)) this.mode = "content-length";
      else if (peek.includes("{")) this.mode = "ndjson";
      else return out;
    }
    if (this.mode === "ndjson") {
      while (true) {
        const idx = this.buf.indexOf(0x0a);
        if (idx === -1) break;
        const line = this.buf.toString("utf8", 0, idx).replace(/\r$/, "");
        this.buf = this.buf.subarray(idx + 1);
        if (line.length === 0) continue;
        try { out.push(JSON.parse(line)); } catch { /* skip */ }
      }
    } else {
      while (true) {
        const txt = this.buf.toString("utf8");
        const headerEnd = txt.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = txt.slice(0, headerEnd);
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) break;
        const len = Number(match[1]);
        const bytesHeader = Buffer.byteLength(`${header}\r\n\r\n`, "utf8");
        if (this.buf.length < bytesHeader + len) break;
        const body = this.buf.subarray(bytesHeader, bytesHeader + len).toString("utf8");
        this.buf = this.buf.subarray(bytesHeader + len);
        try { out.push(JSON.parse(body)); } catch { /* skip */ }
      }
    }
    return out;
  }
}

function isRpcRequest(msg: unknown): msg is {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: unknown;
} {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m.jsonrpc === "2.0" && typeof m.method === "string";
}

function toolSuccess(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

function toolError(message: string) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function toolsList(): unknown[] {
  return [
    {
      name: "artifact_put",
      description: "Persist large textual output under .kirakira/artifacts with metadata.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "UTF-8 text body to store." },
          name: { type: "string", description: "Human-readable artifact label." },
          mime: { type: "string", description: "Optional MIME type." },
          tags: { type: "array", items: { type: "string" }, description: "Optional tags." },
        },
        required: ["content", "name"],
      },
    },
    {
      name: "artifact_get_summary",
      description: "Return artifact metadata and a short UTF-8 preview without loading full content.",
      inputSchema: {
        type: "object",
        properties: {
          artifact_id: { type: "string" },
        },
        required: ["artifact_id"],
      },
    },
    {
      name: "artifact_list",
      description: "List stored artifacts (newest first).",
      inputSchema: {
        type: "object",
        properties: {
          tag: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "content_hash",
      description: "Compute SHA-256 for a workspace file.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
    {
      name: "inspect_binary",
      description: "Inspect magic bytes / heuristics for binary vs text.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
    {
      name: "preview_structured",
      description: "Preview CSV, JSON, or JSONL files with row estimates.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          max_rows: { type: "number" },
        },
        required: ["path"],
      },
    },
  ];
}

function expectRecord(params: unknown): Record<string, unknown> {
  if (params !== undefined && params !== null && typeof params === "object" && !Array.isArray(params)) {
    return params as Record<string, unknown>;
  }
  return {};
}

export async function runArtifactServer(opts: ArtifactServerOptions): Promise<void> {
  const { workspaceRoot } = opts;
  const framer = new HybridJsonRpcFramer();

  const handleToolsCall = async (params: unknown) => {
    const p = expectRecord(params);
    const name = p.name;
    const args = expectRecord(p.arguments);
    if (typeof name !== "string") return toolError("tools/call: missing tool name");

    try {
      switch (name) {
        case "artifact_put": {
          const content = args.content;
          const nm = args.name;
          const mime = typeof args.mime === "string" ? args.mime : undefined;
          const tags = Array.isArray(args.tags) ? args.tags.filter((t): t is string => typeof t === "string") : undefined;
          if (typeof content !== "string" || typeof nm !== "string") {
            return toolError("artifact_put: content and name are required strings");
          }
          const r = writeArtifact(workspaceRoot, content, nm, mime, tags);
          return toolSuccess(r);
        }
        case "artifact_get_summary": {
          const id = args.artifact_id;
          if (typeof id !== "string") return toolError("artifact_get_summary: artifact_id required");
          const meta = readArtifactMeta(workspaceRoot, id);
          const preview = readArtifactPreview(workspaceRoot, id, 512);
          return toolSuccess({
            artifact_id: meta.artifact_id,
            name: meta.name,
            size: meta.size,
            mime: meta.mime,
            hash: meta.hash,
            created_at: meta.created_at,
            preview,
          });
        }
        case "artifact_list": {
          const tag = typeof args.tag === "string" ? args.tag : undefined;
          const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? args.limit : 100;
          const artifacts = listArtifacts(workspaceRoot, tag, limit);
          return toolSuccess({ artifacts });
        }
        case "content_hash": {
          const pathArg = args.path;
          if (typeof pathArg !== "string") return toolError("content_hash: path required");
          const r = hashFile(workspaceRoot, pathArg);
          return toolSuccess(r);
        }
        case "inspect_binary": {
          const pathArg = args.path;
          if (typeof pathArg !== "string") return toolError("inspect_binary: path required");
          const r = inspectBinary(workspaceRoot, pathArg);
          return toolSuccess(r);
        }
        case "preview_structured": {
          const pathArg = args.path;
          const maxRows =
            typeof args.max_rows === "number" && Number.isFinite(args.max_rows) ? args.max_rows : 20;
          if (typeof pathArg !== "string") return toolError("preview_structured: path required");
          const r = previewStructured(workspaceRoot, pathArg, maxRows);
          return toolSuccess(r);
        }
        default:
          return toolError(`Unknown tool: ${name}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return toolError(msg);
    }
  };

  await new Promise<void>((resolve, reject) => {
    process.stdin.resume();
    process.stdin.on("data", (chunk: Buffer) => {
      const msgs = framer.push(chunk);
      for (const msg of msgs) {
        void handleMessage(msg).catch(reject);
      }
    });

    process.stdin.on("end", () => resolve());
    process.stdin.on("error", reject);

    async function handleMessage(msg: unknown): Promise<void> {
      if (!isRpcRequest(msg)) return;
      const { method, id } = msg;

      if (id === undefined || id === null) {
        if (method === "notifications/initialized") return;
        return;
      }

      const reply = (result: unknown) => {
        process.stdout.write(
          encodeJsonRpcMessage({
            jsonrpc: "2.0",
            id,
            result,
          }),
        );
      };

      const replyErr = (code: number, message: string) => {
        process.stdout.write(
          encodeJsonRpcMessage({
            jsonrpc: "2.0",
            id,
            error: { code, message },
          }),
        );
      };

      try {
        switch (method) {
          case "initialize": {
            reply({
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "kirakira-filesystem-artifact", version: "0.1.0" },
            });
            break;
          }
          case "ping":
            reply({});
            break;
          case "tools/list":
            reply({ tools: toolsList() });
            break;
          case "tools/call":
            reply(await handleToolsCall(msg.params));
            break;
          default:
            replyErr(-32601, `Method not found: ${method}`);
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        replyErr(-32603, m);
      }
    }
  });
}
