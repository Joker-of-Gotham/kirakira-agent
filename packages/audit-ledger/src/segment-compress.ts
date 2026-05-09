import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

function spawnSuccess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

export async function compressSegment(segmentPath: string): Promise<string | null> {
  if (!existsSync(segmentPath)) return null;

  try {
    await spawnSuccess("zstd", ["--rm", "-q", segmentPath]);
    return `${segmentPath}.zst`;
  } catch {
    try {
      await spawnSuccess("gzip", [segmentPath]);
      return `${segmentPath}.gz`;
    } catch {
      return null;
    }
  }
}

export async function decompressSegment(compressedPath: string): Promise<string> {
  if (compressedPath.endsWith(".zst")) {
    const outputPath = compressedPath.replace(/\.zst$/, "");
    await spawnSuccess("zstd", ["-d", "--keep", "-q", compressedPath, "-o", outputPath]);
    return outputPath;
  }
  if (compressedPath.endsWith(".gz")) {
    await spawnSuccess("gunzip", ["-k", compressedPath]);
    return compressedPath.replace(/\.gz$/, "");
  }
  return compressedPath;
}
