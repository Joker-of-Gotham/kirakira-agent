export const RUNTIME_READINESS_CHECK_TYPES = Object.freeze({
  http: "http",
  httpHealth: "http-health",
  socket: "socket",
  composeService: "compose-service",
  externalService: "external-service",
  orchestrationTopology: "orchestration-topology",
} as const);

export type RuntimeReadinessCheckType =
  typeof RUNTIME_READINESS_CHECK_TYPES[keyof typeof RUNTIME_READINESS_CHECK_TYPES];

export const RUNTIME_READINESS_HEALTH_SCHEMAS = Object.freeze({
  browserGateway: "browser-gateway-health",
} as const);

export type RuntimeReadinessHealthSchema =
  typeof RUNTIME_READINESS_HEALTH_SCHEMAS[keyof typeof RUNTIME_READINESS_HEALTH_SCHEMAS];

export const RUNTIME_READINESS_CHECKS = Object.freeze({
  daemonSocket: "daemon:socket",
  daemonBrowserGateway: "daemon:browser-gateway",
  orchestrationTopology: "orchestration:topology",
} as const);

export const RUNTIME_PRESENTATION_READINESS_CHECKS = Object.freeze({
  web: "presentation:web",
  desktop: "presentation:desktop",
} as const);

export type RuntimeReadinessCheckName =
  | typeof RUNTIME_READINESS_CHECKS[keyof typeof RUNTIME_READINESS_CHECKS]
  | typeof RUNTIME_PRESENTATION_READINESS_CHECKS[keyof typeof RUNTIME_PRESENTATION_READINESS_CHECKS]
  | `service:${string}`
  | `presentation:${string}`;

export const RUNTIME_DAEMON_READINESS_CHECKS = Object.freeze([
  RUNTIME_READINESS_CHECKS.daemonSocket,
  RUNTIME_READINESS_CHECKS.daemonBrowserGateway,
] as const);

export const RUNTIME_SURFACE_READINESS_CHECKS = Object.freeze({
  daemon: RUNTIME_DAEMON_READINESS_CHECKS,
  web: Object.freeze([RUNTIME_PRESENTATION_READINESS_CHECKS.web] as const),
  desktop: Object.freeze([RUNTIME_PRESENTATION_READINESS_CHECKS.desktop] as const),
} as const);

export const RUNTIME_WORKBENCH_SURFACE_READINESS_CHECKS = Object.freeze({
  daemon: RUNTIME_DAEMON_READINESS_CHECKS,
  web: Object.freeze([
    RUNTIME_READINESS_CHECKS.daemonBrowserGateway,
    RUNTIME_PRESENTATION_READINESS_CHECKS.web,
  ] as const),
  desktop: Object.freeze([
    RUNTIME_READINESS_CHECKS.daemonSocket,
    RUNTIME_READINESS_CHECKS.daemonBrowserGateway,
    RUNTIME_PRESENTATION_READINESS_CHECKS.desktop,
  ] as const),
} as const);

export const RUNTIME_READINESS_SOURCES = Object.freeze({
  services: "services",
  daemonSocketPath: "daemon.socketPath",
  daemonBrowserGateway: "daemon.browserGateway",
  resolvedBrowserGateway: "browser_gateway",
  presentationWebUrl: "presentation.web.url",
  presentationDesktopRendererUrl: "presentation.desktop.rendererUrl",
  resolvedPresentationDesktopRendererUrl: "presentation.desktop.renderer_url",
  orchestrationTopology: "orchestration.topology",
  resolvedOrchestration: "orchestration",
} as const);

export type RuntimeReadinessSource =
  typeof RUNTIME_READINESS_SOURCES[keyof typeof RUNTIME_READINESS_SOURCES];

export function runtimePresentationReadinessCheckName(surface: string): `presentation:${string}` {
  return `presentation:${surface}`;
}

export function runtimeServiceReadinessCheckName(serviceName: string): `service:${string}` {
  return `service:${serviceName}`;
}

export function runtimeSurfaceReadinessCheckNames(surface: string): readonly string[] {
  if (surface === "daemon" || surface === "web" || surface === "desktop") {
    return RUNTIME_SURFACE_READINESS_CHECKS[surface];
  }
  return [runtimePresentationReadinessCheckName(surface)] as const;
}

export function runtimeWorkbenchSurfaceReadinessCheckNames(surface: string): readonly string[] {
  if (surface === "daemon" || surface === "web" || surface === "desktop") {
    return RUNTIME_WORKBENCH_SURFACE_READINESS_CHECKS[surface];
  }
  return [
    RUNTIME_READINESS_CHECKS.daemonBrowserGateway,
    runtimePresentationReadinessCheckName(surface),
  ] as const;
}
