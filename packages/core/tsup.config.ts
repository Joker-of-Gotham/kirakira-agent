import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types/*.ts",
    "src/schemas/*.ts",
    "src/utils/*.ts",
    "src/lock/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node22",
});
