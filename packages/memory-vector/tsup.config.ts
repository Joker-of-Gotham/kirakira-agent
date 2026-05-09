import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types.ts",
    "src/adapter-factory.ts",
    "src/qdrant/*.ts",
    "src/pgvector/*.ts",
    "src/embedding/*.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node22",
});
