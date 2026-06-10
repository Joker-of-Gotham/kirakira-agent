import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KirakiraWorkbench } from "@kirakira/frontend-app";
import { createDesktopRuntimeTransport } from "./desktop-transport.js";
import "@kirakira/frontend-app/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

const desktopBridge = window.kirakiraRuntime;

createRoot(root).render(
  <StrictMode>
    <KirakiraWorkbench
      environmentLabel="Desktop IPC"
      presentationSurface="desktop"
      transport={createDesktopRuntimeTransport() ?? undefined}
      commandPaletteOpenSubscription={desktopBridge?.onOpenCommandPalette}
    />
  </StrictMode>,
);
