import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { isPathWithin } from "@kirakira/core";

import { SandboxPathError } from "../errors.js";
import type { FileDiff, FileSnapshot } from "../types.js";

function hashContent(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export class VirtualFileSystem {
  private readonly files = new Map<string, string>();
  private readonly mutations = new Set<string>();

  constructor(private readonly rootPath: string) {}

  private key(rel: string): string {
    const resolved = path.resolve(this.rootPath, rel);
    if (!isPathWithin(this.rootPath, resolved)) {
      throw new SandboxPathError(`Path escapes workspace: ${rel}`);
    }
    return path.relative(this.rootPath, resolved) || ".";
  }

  async read(rel: string): Promise<string> {
    const k = this.key(rel);
    const mem = this.files.get(k);
    if (mem !== undefined) return mem;
    const p = path.join(this.rootPath, k);
    return fs.readFile(p, "utf8");
  }

  async write(rel: string, body: string): Promise<void> {
    const k = this.key(rel);
    this.files.set(k, body);
    this.mutations.add(k);
    const p = path.join(this.rootPath, k);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body, "utf8");
  }

  trackedMutations(): string[] {
    return [...this.mutations];
  }

  snapshot(): FileSnapshot {
    return { files: new Map(this.files) };
  }

  diff(a: FileSnapshot, b: FileSnapshot): FileDiff[] {
    const out: FileDiff[] = [];
    const all = new Set([...a.files.keys(), ...b.files.keys()]);
    for (const p of all) {
      const va = a.files.get(p);
      const vb = b.files.get(p);
      if (va === undefined && vb !== undefined) {
        out.push({ path: p, kind: "added", afterHash: hashContent(vb) });
      } else if (va !== undefined && vb === undefined) {
        out.push({ path: p, kind: "removed", beforeHash: hashContent(va) });
      } else if (va !== undefined && vb !== undefined && va !== vb) {
        out.push({
          path: p,
          kind: "modified",
          beforeHash: hashContent(va),
          afterHash: hashContent(vb),
        });
      }
    }
    return out;
  }
}
