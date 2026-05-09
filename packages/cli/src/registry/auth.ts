import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RegistryAuth } from "@kirakira/core";
import { getUserRegistryAuthPath } from "@kirakira/core";

export function defaultRegistryAuthPath(): string {
  return getUserRegistryAuthPath();
}

export async function loadRegistryAuth(
  path = defaultRegistryAuthPath(),
): Promise<RegistryAuth | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as RegistryAuth;
  } catch {
    return undefined;
  }
}

export async function saveRegistryAuth(
  auth: RegistryAuth,
  path = defaultRegistryAuthPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
}

export async function clearRegistryAuth(path = defaultRegistryAuthPath()): Promise<void> {
  await writeFile(path, "{}\n", "utf8");
}
