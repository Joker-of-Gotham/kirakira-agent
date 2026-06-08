import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  DEFAULT_DESKTOP_RENDERER_ENDPOINT,
  DEFAULT_WEB_ENDPOINT,
  browserGatewayEndpointFromParts,
  isLoopbackRuntimeHost,
  parseRuntimeOriginList,
  parseRuntimePort,
  parseWebSocketRuntimeEndpoint,
  renderRuntimeEndpoint,
} from "../../../packages/runtime-contracts/src/index.js";

describe("runtime endpoint contract", () => {
  it("defines Kirakira presentation and browser gateway defaults without Vite 5173", () => {
    const defaults = {
      web: renderRuntimeEndpoint(DEFAULT_WEB_ENDPOINT),
      desktop: renderRuntimeEndpoint(DEFAULT_DESKTOP_RENDERER_ENDPOINT),
      browserGateway: renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT),
    };

    expect(defaults.web.url).toBe("http://127.0.0.1:5183/");
    expect(defaults.desktop.url).toBe("http://127.0.0.1:5174/");
    expect(defaults.browserGateway.url).toBe("ws://127.0.0.1:17373/runtime");
    expect(JSON.stringify(defaults)).not.toContain("5173");
  });

  it("normalizes browser gateway paths and typed ports", () => {
    const endpoint = browserGatewayEndpointFromParts({
      port: "17383",
      path: "runtime",
    });

    expect(endpoint).toMatchObject({
      protocol: "ws",
      host: "127.0.0.1",
      port: 17383,
      path: "/runtime",
      url: "ws://127.0.0.1:17383/runtime",
    });
  });

  it("rejects invalid ports and non-websocket gateway URLs", () => {
    expect(() => parseRuntimePort("bad")).toThrow("port is invalid");
    expect(() => parseRuntimePort("70000")).toThrow("port is invalid");
    expect(() => parseWebSocketRuntimeEndpoint("http://127.0.0.1:17373/runtime")).toThrow(
      "protocol is not allowed",
    );
  });

  it("normalizes origin lists and loopback hosts", () => {
    expect(
      parseRuntimeOriginList(
        "http://127.0.0.1:5183/path,http://127.0.0.1:5183,http://localhost:5174",
      ),
    ).toEqual(["http://127.0.0.1:5183", "http://localhost:5174"]);

    expect(isLoopbackRuntimeHost("127.0.0.1")).toBe(true);
    expect(isLoopbackRuntimeHost("localhost")).toBe(true);
    expect(isLoopbackRuntimeHost("[::1]")).toBe(true);
    expect(isLoopbackRuntimeHost("0.0.0.0")).toBe(false);
  });
});
