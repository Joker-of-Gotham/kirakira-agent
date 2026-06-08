import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webDevServerUrl = () => {
  const override = process.env.KIRAKIRA_WEB_URL?.trim();
  if (override) return override;
  return `http://127.0.0.1:${process.env.KIRAKIRA_WEB_PORT?.trim() || "5183"}`;
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
  plugins: [react()],
  server: devServerFromUrl(webDevServerUrl()),
});
