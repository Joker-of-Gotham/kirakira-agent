import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const source = join("src", "postgres", "migrations");
const target = join("dist", "postgres", "migrations");

await mkdir(target, { recursive: true });

for (const entry of await readdir(source)) {
  await cp(join(source, entry), join(target, entry), { recursive: true });
}
