import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devServerFromUrl = (value = "http://127.0.0.1:5183") => {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port),
    strictPort: true,
  };
};

export default defineConfig({
  plugins: [react()],
  server: devServerFromUrl(process.env.KIRAKIRA_WEB_URL),
});
