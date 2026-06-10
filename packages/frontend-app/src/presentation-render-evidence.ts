import { createHash } from "node:crypto";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ApprovalDecision,
  RuntimeTransport,
  RuntimeTransportEvent,
  RuntimeTransportMode,
  SubscribeRunOptions,
  SubmitPromptRequest,
} from "@kirakira/frontend-core";
import type {
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
  RuntimeMcpListRequest,
  RuntimeMcpListResult,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
} from "@kirakira/runtime-contracts";

import { KirakiraWorkbench, type KirakiraPresentationSurface } from "./workbench.js";

export interface PresentationRenderEvidenceOptions {
  profile?: string;
  generatedAt?: string;
  command?: string;
}

export interface PresentationRenderCheck {
  id: string;
  label: string;
  status: "pass" | "fail";
  evidence: string;
}

export interface PresentationRenderMarker {
  id: string;
  value: string;
  status: "pass" | "fail";
}

export interface PresentationRenderSurfaceEvidence {
  surface: KirakiraPresentationSurface;
  transportMode: RuntimeTransportMode;
  environmentLabel: string;
  html: {
    bytes: number;
    sha256: string;
  };
  selectors: PresentationRenderMarker[];
  textMarkers: PresentationRenderMarker[];
  transportCalls: Record<string, number>;
  failures: string[];
}

export interface PresentationRenderEvidenceReport {
  schemaVersion: 1;
  gate: "presentation-render-evidence";
  profile: string;
  status: "passed" | "failed";
  generatedAt: string;
  command?: string;
  inputs: {
    sharedRenderer: string;
    webEntrypoint: string;
    desktopEntrypoint: string;
  };
  surfaces: PresentationRenderSurfaceEvidence[];
  checks: PresentationRenderCheck[];
  summary: {
    passed: number;
    failed: number;
    total: number;
  };
}

interface SurfaceConfig {
  surface: KirakiraPresentationSurface;
  transportMode: Exclude<RuntimeTransportMode, "mock">;
  environmentLabel: string;
}

const SURFACES: readonly SurfaceConfig[] = Object.freeze([
  {
    surface: "web",
    transportMode: "browser-gateway",
    environmentLabel: "Browser gateway",
  },
  {
    surface: "desktop",
    transportMode: "desktop-ipc",
    environmentLabel: "Desktop IPC",
  },
]);

const SHARED_SELECTOR_MARKERS = Object.freeze([
  { id: "shell", value: 'class="kk-shell"' },
  { id: "run-navigation", value: 'aria-label="Run navigation"' },
  { id: "workspace", value: 'aria-label="Runtime workspace"' },
  { id: "workspace-views", value: 'aria-label="Workspace views"' },
]);

const SHARED_TEXT_MARKERS = Object.freeze([
  { id: "product", value: "Kirakira Agent" },
  { id: "runs", value: "Runs" },
  { id: "recent-runs", value: "Recent Runs" },
  { id: "systems", value: "Systems" },
]);

const TRANSPORT_METHODS = Object.freeze([
  "connect",
  "disconnect",
  "getStatus",
  "submitPrompt",
  "getState",
  "getArtifactContent",
  "listMcpTools",
  "callMcpTool",
  "subscribeRun",
  "approve",
  "cancel",
  "drain",
]);

export function buildPresentationRenderEvidence(
  options: PresentationRenderEvidenceOptions = {},
): PresentationRenderEvidenceReport {
  const surfaces = SURFACES.map((surface) => renderSurface(surface));
  const checks = surfaces.flatMap((surface) => surfaceChecks(surface));
  const failed = checks.filter((check) => check.status === "fail").length;
  const passed = checks.length - failed;
  return {
    schemaVersion: 1,
    gate: "presentation-render-evidence",
    profile: options.profile ?? "workbench-host",
    status: failed === 0 ? "passed" : "failed",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ...(options.command ? { command: options.command } : {}),
    inputs: {
      sharedRenderer: "packages/frontend-app/src/workbench.tsx",
      webEntrypoint: "apps/web/src/main.tsx",
      desktopEntrypoint: "apps/desktop/src/renderer/main.tsx",
    },
    surfaces,
    checks,
    summary: {
      passed,
      failed,
      total: checks.length,
    },
  };
}

function renderSurface(config: SurfaceConfig): PresentationRenderSurfaceEvidence {
  const transport = createInertTransport(config.transportMode);
  const html = renderToStaticMarkup(
    createElement(KirakiraWorkbench, {
      presentationSurface: config.surface,
      environmentLabel: config.environmentLabel,
      transport,
    }),
  );
  const selectors = [
    ...SHARED_SELECTOR_MARKERS,
    {
      id: "surface-identity",
      value: `data-kk-presentation-surface="${config.surface}"`,
    },
  ].map((marker) => markerEvidence(marker, html));
  const textMarkers = [
    ...SHARED_TEXT_MARKERS,
    { id: "environment", value: config.environmentLabel },
  ].map((marker) => markerEvidence(marker, html));
  return {
    surface: config.surface,
    transportMode: config.transportMode,
    environmentLabel: config.environmentLabel,
    html: {
      bytes: Buffer.byteLength(html, "utf8"),
      sha256: createHash("sha256").update(html).digest("hex"),
    },
    selectors,
    textMarkers,
    transportCalls: transport.calls,
    failures: [
      ...selectors.filter((marker) => marker.status === "fail").map((marker) => marker.id),
      ...textMarkers.filter((marker) => marker.status === "fail").map((marker) => marker.id),
      ...Object.entries(transport.calls)
        .filter(([, count]) => count > 0)
        .map(([method, count]) => `transport:${method}:${count}`),
    ],
  };
}

function surfaceChecks(surface: PresentationRenderSurfaceEvidence): PresentationRenderCheck[] {
  const selectorFailures = surface.selectors.filter((marker) => marker.status === "fail");
  const textFailures = surface.textMarkers.filter((marker) => marker.status === "fail");
  const transportCallCount = Object.values(surface.transportCalls).reduce(
    (total, count) => total + count,
    0,
  );
  return [
    {
      id: `${surface.surface}:html`,
      label: `${surface.surface} SSR markup`,
      status: surface.html.bytes > 0 && /^[a-f0-9]{64}$/u.test(surface.html.sha256) ? "pass" : "fail",
      evidence: `bytes=${surface.html.bytes}; sha256=${surface.html.sha256}`,
    },
    {
      id: `${surface.surface}:selectors`,
      label: `${surface.surface} SSR selectors`,
      status: selectorFailures.length === 0 ? "pass" : "fail",
      evidence: `missing=${selectorFailures.map((marker) => marker.id).join(",") || "none"}`,
    },
    {
      id: `${surface.surface}:text`,
      label: `${surface.surface} SSR text markers`,
      status: textFailures.length === 0 ? "pass" : "fail",
      evidence: `missing=${textFailures.map((marker) => marker.id).join(",") || "none"}`,
    },
    {
      id: `${surface.surface}:transport`,
      label: `${surface.surface} inert transport boundary`,
      status: transportCallCount === 0 ? "pass" : "fail",
      evidence: `calls=${transportCallCount}`,
    },
  ];
}

function markerEvidence(
  marker: { id: string; value: string },
  html: string,
): PresentationRenderMarker {
  return {
    id: marker.id,
    value: marker.value,
    status: html.includes(marker.value) ? "pass" : "fail",
  };
}

function createInertTransport(mode: Exclude<RuntimeTransportMode, "mock">): RuntimeTransport & {
  calls: Record<string, number>;
} {
  const calls = Object.fromEntries(TRANSPORT_METHODS.map((method) => [method, 0]));
  const fail = (method: string) => {
    calls[method] = (calls[method] ?? 0) + 1;
    throw new Error(`Presentation render evidence must not call transport.${method}`);
  };
  return {
    mode,
    calls,
    connect: async () => fail("connect"),
    disconnect: () => fail("disconnect"),
    getStatus: async () => fail("getStatus"),
    submitPrompt: async (_request: SubmitPromptRequest) => fail("submitPrompt"),
    getState: async (_runId: string) => fail("getState"),
    getArtifactContent: async (_request: RuntimeArtifactContentRequest) =>
      fail("getArtifactContent") as RuntimeArtifactContent,
    listMcpTools: async (_request?: RuntimeMcpListRequest) =>
      fail("listMcpTools") as RuntimeMcpListResult,
    callMcpTool: async (_request: RuntimeMcpToolCallRequest) =>
      fail("callMcpTool") as RuntimeMcpToolCallResult,
    subscribeRun: (
      _runId: string,
      _onEvent: (event: RuntimeTransportEvent) => void,
      _options?: SubscribeRunOptions,
    ) => {
      return fail("subscribeRun");
    },
    approve: async (_decision: ApprovalDecision) => fail("approve"),
    cancel: async (_runId: string, _reason?: string) => fail("cancel"),
    drain: async () => fail("drain"),
  };
}
