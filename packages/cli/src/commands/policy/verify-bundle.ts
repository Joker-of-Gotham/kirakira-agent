import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { Command, Flags } from "@oclif/core";

import { canonicalJson } from "@kirakira/audit-ledger";

export interface PolicyVerifyBundleOptions {
  bundleDir?: string;
  json?: boolean;
}

interface SigFilePayload {
  files?: Record<
    string,
    {
      hashes?: Record<string, string>;
    }
  >;
  signatures?: Array<Record<string, unknown>>;
}

export async function policyVerifyBundle(options: PolicyVerifyBundleOptions = {}): Promise<void> {
  const dir = options.bundleDir ?? join(process.cwd(), "policy-bundle");
  const fallback = join(homedir(), ".kirakira", "policy-bundle");
  let root = dir;
  if (!(await isDirAccessible(dir))) root = fallback;

  if (!(await isDirAccessible(root))) {
    throw new Error(
      `Policy bundle directory not found: tried ${dir} and ~/.kirakira/policy-bundle`,
    );
  }

  await access(root, constants.R_OK);

  let sigPayload: SigFilePayload | undefined;
  const sigCandidates = [join(root, ".signatures.json"), join(root, "signatures.json")];

  let sigUsed: string | undefined;
  for (const candidate of sigCandidates) {
    try {
      sigPayload = JSON.parse(await readFile(candidate, "utf8")) as SigFilePayload;
      sigUsed = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!sigPayload) {
    const msg =
      options.json ?? false
        ? JSON.stringify({
            ok: true,
            root,
            reason:
              'No ".signatures.json" present — nothing to cryptographically verify (directory readable).',
          })
        : `No detached ".signatures.json" under ${root}; directory looks readable OK.`;

    console.log(msg);
    return;
  }

  const errs: string[] = [];

  if (!sigPayload.files || typeof sigPayload.files !== "object")
    errs.push("signatures blob missing \"files\"");

  let checked = 0;
  if (sigPayload.files && typeof sigPayload.files === "object") {
    for (const [rel, digestBlock] of Object.entries(sigPayload.files)) {
      if (!digestBlock?.hashes?.sha256) {
        errs.push(`entry ${rel} missing sha256`);
        continue;
      }
      const abs = join(root, rel);
      const txt = await readFile(abs).catch(() => undefined);
      if (!txt) {
        errs.push(`missing file referenced by signatures: ${rel}`);
        continue;
      }
      const sha = await sha256Hex(txt);
      if (sha !== digestBlock.hashes.sha256.toLowerCase()) errs.push(`hash mismatch ${rel}`);
      checked += 1;
    }
  }

  if (!sigPayload.signatures?.length)
    errs.push("signatures array empty — detached signature envelopes missing");

  const ok = errs.length === 0;

  const report = {
    ok,
    root,
    signaturesPath: sigUsed,
    manifestsChecked: checked,
    issues: errs,
    canonical_sample: canonicalJson({ manifestsChecked: checked }),
  };

  if (options.json ?? false) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (ok) console.log(`Bundle integrity verified under ${root} (${checked} manifest digests)`);
  else console.error(report.issues.join("\n"));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex").toLowerCase();
}

async function isDirAccessible(p: string): Promise<boolean> {
  try {
    const st = await stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export default class PolicyVerifyBundleCmd extends Command {
  static override description = "Verify staged OPA bundle artifacts + detached .signatures.json";

  static override flags = {
    dir: Flags.string({
      char: "d",
      description: "Root directory extracted from bundle",
    }),
    json: Flags.boolean({ description: "Emit JSON report", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PolicyVerifyBundleCmd);
    await policyVerifyBundle({ bundleDir: flags.dir, json: flags.json ?? false });
  }
}
