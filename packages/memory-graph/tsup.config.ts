import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node22",
  external: ["@kirakira/core", "@kirakira/memory-core", "neo4j-driver"],
});
