import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const desktopRendererUrl = () => {
  const override =
    process.env.KIRAKIRA_DESKTOP_RENDERER_URL?.trim()
    || process.env.KIRAKIRA_DESKTOP_DEV_URL?.trim();
  if (override) return override;
  return `http://127.0.0.1:${process.env.KIRAKIRA_DESKTOP_RENDERER_PORT?.trim() || "5174"}`;
};

const devServerFromUrl = (value: string) => {
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
  server: devServerFromUrl(desktopRendererUrl()),
});
