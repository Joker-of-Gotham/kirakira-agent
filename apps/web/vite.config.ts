import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  DEFAULT_WEB_ENDPOINT,
  parseHttpRuntimeEndpoint,
  renderRuntimeEndpoint,
  type RuntimeEndpointParts,
} from "@kirakira/runtime-contracts";

const webDevServerUrl = () => {
  const override = process.env.KIRAKIRA_WEB_URL?.trim();
  if (override) return parseHttpRuntimeEndpoint(override);
  return renderRuntimeEndpoint({
    ...DEFAULT_WEB_ENDPOINT,
    port: process.env.KIRAKIRA_WEB_PORT?.trim() || DEFAULT_WEB_ENDPOINT.port,
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
  plugins: [react()],
  server: devServerFromUrl(webDevServerUrl()),
});
