import {
  createSnapshot,
  listSnapshots,
  readMeta,
  readSnapshottedFile,
  resolveWorkspacePath,
  rollbackSnapshot,
} from "./snapshot.js";
import { applyPatch, buildUnifiedFileDiff, previewPatch } from "./patch.js";
import fs from "node:fs";

export type PatchServerOptions = {
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
      name: "snapshot_create",
      description:
        "Create a snapshot copy of a file or directory under .kirakira/snapshots before modifying it.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative path to snapshot." },
        },
        required: ["path"],
      },
    },
    {
      name: "snapshot_list",
      description: "List snapshots stored under .kirakira/snapshots, optionally filtered by path prefix.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Optional path filter; keeps snapshots whose root intersects this path.",
          },
        },
      },
    },
    {
      name: "patch_preview",
      description: "Dry-run apply a unified diff patch and report stats plus resulting unified diff.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Primary workspace path (anchor for validation / relative patch targets).",
          },
          patch: { type: "string", description: "Unified diff text." },
        },
        required: ["path", "patch"],
      },
    },
    {
      name: "patch_apply",
      description:
        "Apply a unified diff patch. Optionally reuse an existing snapshot_id; otherwise snapshots `path` first.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative path to snapshot before applying (unless snapshot_id set).",
          },
          patch: { type: "string", description: "Unified diff text." },
          snapshot_id: {
            type: "string",
            description: "If set, skip creating a snapshot and validate this id exists.",
          },
        },
        required: ["path", "patch"],
      },
    },
    {
      name: "rollback",
      description: "Restore workspace content from a snapshot mirror.",
      inputSchema: {
        type: "object",
        properties: {
          snapshot_id: { type: "string", description: "Snapshot folder id under .kirakira/snapshots." },
        },
        required: ["snapshot_id"],
      },
    },
    {
      name: "diff_files",
      description:
        "Compare two workspace files, or one workspace file against the same path captured in a snapshot.",
      inputSchema: {
        type: "object",
        properties: {
          path_a: { type: "string" },
          path_b: { type: "string" },
          path: { type: "string", description: "Used with snapshot_id." },
          snapshot_id: { type: "string" },
        },
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

export async function runPatchServer(opts: PatchServerOptions): Promise<void> {
  const { workspaceRoot } = opts;
  const framer = new HybridJsonRpcFramer();

  const handleToolsCall = async (params: unknown) => {
    const p = expectRecord(params);
    const name = p.name;
    const args = expectRecord(p.arguments);
    if (typeof name !== "string") return toolError("tools/call: missing tool name");

    try {
      switch (name) {
        case "snapshot_create": {
          const pathArg = args.path;
          if (typeof pathArg !== "string") return toolError("snapshot_create: path required");
          const meta = createSnapshot(workspaceRoot, pathArg);
          return toolSuccess({
            snapshot_id: meta.snapshot_id,
            path: meta.relative_path === "." ? "." : meta.relative_path,
            size: meta.size,
            created_at: meta.created_at,
          });
        }
        case "snapshot_list": {
          const filterPath = typeof args.path === "string" ? args.path : undefined;
          const snapshots = listSnapshots(workspaceRoot, filterPath);
          return toolSuccess({ snapshots });
        }
        case "patch_preview": {
          const pathArg = args.path;
          const patch = args.patch;
          if (typeof pathArg !== "string" || typeof patch !== "string") {
            return toolError("patch_preview: path and patch strings required");
          }
          resolveWorkspacePath(workspaceRoot, pathArg);
          const pr = previewPatch(workspaceRoot, pathArg, patch);
          if (!pr.can_apply) {
            return toolSuccess({
              can_apply: false,
              diff: pr.diff,
              files_affected: pr.files_affected,
              insertions: pr.insertions,
              deletions: pr.deletions,
              error: pr.error,
            });
          }
          return toolSuccess({
            can_apply: true,
            diff: pr.diff,
            files_affected: pr.files_affected,
            insertions: pr.insertions,
            deletions: pr.deletions,
          });
        }
        case "patch_apply": {
          const pathArg = args.path;
          const patch = args.patch;
          const existingSnap = typeof args.snapshot_id === "string" ? args.snapshot_id : undefined;
          if (typeof pathArg !== "string" || typeof patch !== "string") {
            return toolError("patch_apply: path and patch strings required");
          }
          resolveWorkspacePath(workspaceRoot, pathArg);

          let snapshot_id: string;
          if (existingSnap) {
            readMeta(workspaceRoot, existingSnap);
            snapshot_id = existingSnap;
          } else {
            const meta = createSnapshot(workspaceRoot, pathArg);
            snapshot_id = meta.snapshot_id;
          }

          const applied = applyPatch(workspaceRoot, pathArg, patch);
          if (!applied.applied) {
            return toolSuccess({
              applied: false,
              files_changed: applied.files_changed,
              insertions: applied.insertions,
              deletions: applied.deletions,
              snapshot_id,
              error: applied.error,
            });
          }
          return toolSuccess({
            applied: true,
            files_changed: applied.files_changed,
            insertions: applied.insertions,
            deletions: applied.deletions,
            snapshot_id,
          });
        }
        case "rollback": {
          const sid = args.snapshot_id;
          if (typeof sid !== "string") return toolError("rollback: snapshot_id required");
          const meta = rollbackSnapshot(workspaceRoot, sid);
          return toolSuccess({
            rolled_back: true,
            path: meta.relative_path === "." ? "." : meta.relative_path,
            snapshot_id: sid,
          });
        }
        case "diff_files": {
          const pathA = args.path_a;
          const pathB = args.path_b;
          const single = args.path;
          const sid = args.snapshot_id;

          if (typeof pathA === "string" && typeof pathB === "string") {
            const absA = resolveWorkspacePath(workspaceRoot, pathA);
            const absB = resolveWorkspacePath(workspaceRoot, pathB);
            if (!fs.existsSync(absA) || !fs.existsSync(absB)) {
              return toolError("diff_files: path_a or path_b does not exist");
            }
            if (fs.statSync(absA).isDirectory() || fs.statSync(absB).isDirectory()) {
              return toolError("diff_files: directories not supported; specify files");
            }
            const ta = fs.readFileSync(absA, "utf8");
            const tb = fs.readFileSync(absB, "utf8");
            const d = buildUnifiedFileDiff(`${pathA} vs ${pathB}`, ta, tb);
            return toolSuccess({ diff: d, identical: ta === tb });
          }

          if (typeof single === "string" && typeof sid === "string") {
            const abs = resolveWorkspacePath(workspaceRoot, single);
            if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
              return toolError("diff_files: path must be an existing file");
            }
            const cur = fs.readFileSync(abs, "utf8");
            const snap = readSnapshottedFile(workspaceRoot, sid, single);
            const d = buildUnifiedFileDiff(`${single} (workspace vs snapshot ${sid})`, cur, snap);
            return toolSuccess({ diff: d, identical: cur === snap });
          }

          return toolError("diff_files: provide either {path_a, path_b} or {path, snapshot_id}");
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
              serverInfo: { name: "kirakira-filesystem-patch", version: "0.1.0" },
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
