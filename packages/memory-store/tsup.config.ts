import { defineConfig } from "tsup";
import { cpSync } from "node:fs";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/postgres/*.ts",
    "src/postgres/repositories/*.ts",
    "src/redis/*.ts",
    "src/blob/*.ts",
    "src/outbox/*.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node22",
  onSuccess: async () => {
    cpSync("src/postgres/migrations", "dist/postgres/migrations", { recursive: true });
  },
});
