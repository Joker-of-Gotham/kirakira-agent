import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256Prefixed(data: string | Buffer): string {
  return `sha256:${sha256Hex(data)}`;
}

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
    stream.on("error", reject);
  });
}
