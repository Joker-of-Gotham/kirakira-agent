import {
  createBrowserGatewayTransport,
  type RuntimeTransport,
} from "@kirakira/frontend-core";

export type KirakiraWebRuntimeMode = "auto" | "mock" | "gateway";

export interface WebRuntimeConfig {
  mode: KirakiraWebRuntimeMode;
  environmentLabel: string;
  transport?: RuntimeTransport;
  error?: string;
}

const runtimeMode = (value: string | undefined): KirakiraWebRuntimeMode => {
  if (value === "mock" || value === "gateway" || value === "auto") return value;
  return "auto";
};

export function resolveWebRuntimeConfig(env: ImportMetaEnv): WebRuntimeConfig {
  const mode = runtimeMode(env.VITE_KIRAKIRA_RUNTIME_MODE);
  const endpoint = env.VITE_KIRAKIRA_GATEWAY_URL?.trim();
  const token = env.VITE_KIRAKIRA_GATEWAY_TOKEN?.trim();
  const isProd = env.PROD;

  if (mode === "mock") {
    return { mode, environmentLabel: "Mock preview" };
  }

  if (endpoint) {
    return {
      mode: "gateway",
      environmentLabel: "Browser gateway",
      transport: createBrowserGatewayTransport({
        endpoint,
        token: token && token.length > 0 ? token : undefined,
      }),
    };
  }

  if (mode === "gateway") {
    return {
      mode,
      environmentLabel: "Gateway misconfigured",
      error: "VITE_KIRAKIRA_GATEWAY_URL is required when runtime mode is gateway.",
    };
  }

  if (isProd) {
    return {
      mode,
      environmentLabel: "Gateway misconfigured",
      error: "Production web builds require VITE_KIRAKIRA_GATEWAY_URL or explicit mock mode.",
    };
  }

  return {
    mode: "mock",
    environmentLabel: "Mock preview",
  };
}
