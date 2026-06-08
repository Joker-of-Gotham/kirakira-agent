import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devServerFromUrl = (value = "http://127.0.0.1:5174") => {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port),
    strictPort: true,
  };
};

export default defineConfig({
  root: ".",
  plugins: [react()],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
  server: devServerFromUrl(
    process.env.KIRAKIRA_DESKTOP_RENDERER_URL ?? process.env.KIRAKIRA_DESKTOP_DEV_URL,
  ),
});
