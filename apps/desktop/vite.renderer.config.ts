import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  DEFAULT_DESKTOP_RENDERER_ENDPOINT,
  parseHttpRuntimeEndpoint,
  renderRuntimeEndpoint,
  type RuntimeEndpointParts,
} from "@kirakira/runtime-contracts";

const desktopRendererUrl = () => {
  const override =
    process.env.KIRAKIRA_DESKTOP_RENDERER_URL?.trim()
    || process.env.KIRAKIRA_DESKTOP_DEV_URL?.trim();
  if (override) return parseHttpRuntimeEndpoint(override);
  return renderRuntimeEndpoint({
    ...DEFAULT_DESKTOP_RENDERER_ENDPOINT,
    port:
      process.env.KIRAKIRA_DESKTOP_RENDERER_PORT?.trim() ||
      DEFAULT_DESKTOP_RENDERER_ENDPOINT.port,
  });
};

const devServerFromUrl = (endpoint: RuntimeEndpointParts) => {
  return {
    host: endpoint.host,
    port: endpoint.port,
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
