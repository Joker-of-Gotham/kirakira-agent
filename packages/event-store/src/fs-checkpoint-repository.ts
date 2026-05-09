import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { EamError } from "@kirakira/core";

import type { CheckpointEnvelope, CheckpointRepository } from "./checkpoint-types.js";

export class CheckpointStoreError extends EamError {
  constructor(message: string, options?: ErrorOptions) {
    super("CHECKPOINT_STORE", message, options);
    this.name = "CheckpointStoreError";
  }
}

export class FsCheckpointRepository implements CheckpointRepository {
  constructor(private readonly rootDir: string) {}

  private pathFor(id: string): string {
    const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.rootDir, `${safe}.json`);
  }

  async save(envelope: CheckpointEnvelope): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const path = this.pathFor(envelope.id);
    await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  }

  async load(id: string): Promise<CheckpointEnvelope | undefined> {
    const path = this.pathFor(id);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as CheckpointEnvelope;
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
      if (code === "ENOENT") return undefined;
      throw new CheckpointStoreError(`checkpoint load failed for ${id}`, { cause: err });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await unlink(this.pathFor(id));
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
      if (code !== "ENOENT") {
        throw new CheckpointStoreError(`checkpoint delete failed for ${id}`, { cause: err });
      }
    }
  }
}
