import { describe, expect, it } from "vitest";
import {
  browserGatewayHealthUrl,
  fetchBrowserGatewayHealth,
} from "../../../packages/frontend-core/src/index.js";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  renderRuntimeEndpoint,
  runtimeBrowserGatewayHealth,
} from "../../../packages/runtime-contracts/src/index.js";

describe("browser gateway health client", () => {
  it("derives the HTTP health URL from the websocket runtime endpoint", () => {
    expect(browserGatewayHealthUrl("ws://127.0.0.1:17373/runtime")).toBe(
      "http://127.0.0.1:17373/healthz",
    );
    expect(browserGatewayHealthUrl("wss://example.test:9443/runtime?token=secret")).toBe(
      "https://example.test:9443/healthz",
    );
  });

  it("fetches and validates typed browser gateway health", async () => {
    const endpoint = renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT);
    const seen: string[] = [];
    const health = await fetchBrowserGatewayHealth({
      endpoint,
      fetcher: (async (url) => {
        seen.push(String(url));
        return {
          ok: true,
          status: 200,
          json: async () =>
            runtimeBrowserGatewayHealth({
              endpoint,
              tokenRequired: true,
            }),
        } as Response;
      }) as typeof fetch,
    });

    expect(seen).toEqual(["http://127.0.0.1:17373/healthz"]);
    expect(health.endpoint.url).toBe("ws://127.0.0.1:17373/runtime");
    expect(health.tokenRequired).toBe(true);
  });

  it("rejects failed or malformed health responses", async () => {
    await expect(
      fetchBrowserGatewayHealth({
        endpoint: "ws://127.0.0.1:17373/runtime",
        fetcher: (async () =>
          ({
            ok: false,
            status: 503,
            json: async () => ({}),
          }) as Response) as typeof fetch,
      }),
    ).rejects.toThrow("503");

    await expect(
      fetchBrowserGatewayHealth({
        endpoint: "ws://127.0.0.1:17373/runtime",
        fetcher: (async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
          }) as Response) as typeof fetch,
      }),
    ).rejects.toThrow("health response is invalid");
  });
});
