/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KIRAKIRA_RUNTIME_MODE?: "auto" | "mock" | "gateway";
  readonly VITE_KIRAKIRA_GATEWAY_URL?: string;
  readonly VITE_KIRAKIRA_GATEWAY_TOKEN?: string;
}
