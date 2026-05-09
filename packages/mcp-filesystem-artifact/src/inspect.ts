import fs from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "./workspace-path.js";

const MAGIC: Array<{ test: (b: Buffer) => boolean; mime: string; description: string }> = [
  {
    test: (b) => b.length >= 8 && b[0] === 0x89 && b.subarray(1, 4).equals(Buffer.from("PNG")),
    mime: "image/png",
    description: "PNG image",
  },
  {
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    mime: "image/jpeg",
    description: "JPEG image",
  },
  {
    test: (b) =>
      b.length >= 6 &&
      /^GIF8[79]a/.test(Buffer.from(b.subarray(0, 6)).toString("latin1")),
    mime: "image/gif",
    description: "GIF image",
  },
  {
    test: (b) =>
      b.length >= 4 &&
      b[0] === 0x25 &&
      b[1] === 0x50 &&
      b[2] === 0x44 &&
      b[3] === 0x46 &&
      Buffer.from(b.subarray(0, 5)).toString("ascii").startsWith("%PDF"),
    mime: "application/pdf",
    description: "PDF document",
  },
  {
    test: (b) =>
      b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) && b[3] === 0x04,
    mime: "application/zip",
    description: "ZIP archive (or Office Open XML / JAR family)",
  },
  {
    test: (b) =>
      b.length >= 12 &&
      Buffer.from(b.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(b.subarray(8, 12)).toString("ascii") === "WEBP",
    mime: "image/webp",
    description: "WebP image",
  },
  {
    test: (b) =>
      b.length >= 12 &&
      b.subarray(4, 8).equals(Buffer.from("ftyp")) &&
      (Buffer.from(b.subarray(8, 12)).toString("ascii") === "qt  " ||
        Buffer.from(b.subarray(8, 12)).toString("ascii").startsWith("isom") ||
        Buffer.from(b.subarray(8, 12)).toString("ascii").startsWith("mp42")),
    mime: "video/mp4",
    description: "ISO MP4 / QuickTime container",
  },
  {
    test: (b) =>
      b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46,
    mime: "application/x-elf",
    description: "ELF executable or shared object",
  },
  {
    test: (b) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b,
    mime: "application/gzip",
    description: "gzip compressed data",
  },
];

export type InspectBinaryResult = {
  path: string;
  is_binary: boolean;
  mime: string;
  size: number;
  description: string;
};

function guessUtf8TextMime(ext: string): string | undefined {
  const e = ext.toLowerCase();
  if (e === ".json") return "application/json";
  if (e === ".csv") return "text/csv";
  if (e === ".jsonl" || e === ".ndjson") return "application/jsonlines+json";
  if (e === ".txt" || e === ".md") return "text/plain";
  return undefined;
}

export function inspectBinary(workspaceRoot: string, userPath: string): InspectBinaryResult {
  const abs = resolveWorkspacePath(workspaceRoot, userPath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    throw new Error(`Not a file: ${userPath}`);
  }
  const st = fs.statSync(abs);
  const fd = fs.openSync(abs, "r");
  const buf = Buffer.allocUnsafe(Math.min(4096, st.size));
  let n = 0;
  try {
    n = fs.readSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const sample = buf.subarray(0, n);

  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === undefined) continue;
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 127) nonPrintable++;
  }
  const ratio = sample.length ? nonPrintable / sample.length : 0;
  const looksBinary = ratio > 0.02 || sample.includes(0);

  for (const m of MAGIC) {
    if (m.test(sample)) {
      return {
        path: userPath,
        is_binary: true,
        mime: m.mime,
        size: st.size,
        description: m.description,
      };
    }
  }

  const extMime = guessUtf8TextMime(path.extname(userPath));
  if (!looksBinary) {
    return {
      path: userPath,
      is_binary: false,
      mime: extMime ?? "text/plain",
      size: st.size,
      description: extMime ? `Text-like file (${extMime})` : "UTF-8 text or empty file",
    };
  }

  return {
    path: userPath,
    is_binary: true,
    mime: "application/octet-stream",
    size: st.size,
    description: "Unrecognized binary data",
  };
}

export type StructuredPreviewResult = {
  path: string;
  format: string;
  row_count: number;
  columns?: string[];
  preview: string;
};

function detectFormat(userPath: string): "csv" | "json" | "jsonl" | "unknown" {
  const ext = path.extname(userPath).toLowerCase();
  if (ext === ".csv") return "csv";
  if (ext === ".json") return "json";
  if (ext === ".jsonl" || ext === ".ndjson") return "jsonl";
  return "unknown";
}

export function previewStructured(
  workspaceRoot: string,
  userPath: string,
  maxRows = 20,
): StructuredPreviewResult {
  const abs = resolveWorkspacePath(workspaceRoot, userPath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    throw new Error(`Not a file: ${userPath}`);
  }
  let fmt = detectFormat(userPath);
  const raw = fs.readFileSync(abs, "utf8");
  if (fmt === "unknown") {
    const t = raw.trimStart();
    if (t.startsWith("{") || t.startsWith("[")) fmt = "json";
    else if (t.split(/\r?\n/).filter(Boolean).every((line) => line.startsWith("{") || line.startsWith("["))) {
      fmt = "jsonl";
    } else if (raw.includes(",") && raw.includes("\n")) fmt = "csv";
  }

  const rows = Math.max(1, Math.min(maxRows, 10_000));

  if (fmt === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`preview_structured: invalid JSON in ${userPath}`);
    }
    const rowsEstimate = Array.isArray(parsed) ? parsed.length : 1;
    const previewObj =
      Array.isArray(parsed) ? parsed.slice(0, rows) : { value: parsed };
    return {
      path: userPath,
      format: "json",
      row_count: rowsEstimate,
      columns: Array.isArray(parsed) && parsed.length && typeof parsed[0] === "object" && parsed[0] !== null
        ? Object.keys(parsed[0] as object)
        : undefined,
      preview: JSON.stringify(previewObj, null, 2).slice(0, 16_384),
    };
  }

  if (fmt === "jsonl") {
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
    const previewLines = lines.slice(0, rows);
    const parsedRows: unknown[] = [];
    for (let i = 0; i < previewLines.length; i++) {
      try {
        parsedRows.push(JSON.parse(previewLines[i] as string));
      } catch {
        throw new Error(`preview_structured: invalid JSONL at line ${i + 1}`);
      }
    }
    let columns: string[] | undefined;
    if (parsedRows.length && typeof parsedRows[0] === "object" && parsedRows[0] !== null) {
      columns = Object.keys(parsedRows[0] as object);
    }
    return {
      path: userPath,
      format: "jsonl",
      row_count: lines.length,
      columns,
      preview: previewLines.join("\n").slice(0, 16_384),
    };
  }

  if (fmt === "csv") {
    const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
    const headerLine = lines[0] ?? "";
    const columns = splitCsvLine(headerLine);
    const body = lines.slice(1);
    return {
      path: userPath,
      format: "csv",
      row_count: body.length,
      columns,
      preview: [headerLine, ...body.slice(0, rows)].join("\n").slice(0, 16_384),
    };
  }

  throw new Error(`preview_structured: unsupported format for ${userPath}`);
}

/** Minimal CSV line splitter (handles quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  out.push(cur);
  return out;
}
