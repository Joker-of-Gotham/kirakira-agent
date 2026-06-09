import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KirakiraWorkbench } from "@kirakira/frontend-app";
import { resolveWebRuntimeConfig } from "./runtime-config.js";
import "@kirakira/frontend-app/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

const runtimeConfig = resolveWebRuntimeConfig(import.meta.env);

createRoot(root).render(
  <StrictMode>
    {runtimeConfig.error ? (
      <main className="kk-config-error">
        <section>
          <p>Runtime configuration</p>
          <h1>Kirakira web runtime is not connected</h1>
          <span>{runtimeConfig.error}</span>
        </section>
      </main>
    ) : (
      <KirakiraWorkbench
        environmentLabel={runtimeConfig.environmentLabel}
        presentationSurface="web"
        transport={runtimeConfig.transport}
      />
    )}
  </StrictMode>,
);
