import { describe, expect, it } from "vitest";
import {
  desktopRendererUrl,
  isTrustedDesktopRuntimeSenderUrl,
  resolveDesktopRendererEndpoint,
  trustedDesktopRendererOrigins,
} from "../../../apps/desktop/src/main/renderer-endpoint.js";

describe("desktop renderer endpoint", () => {
  it("uses only explicit loopback HTTP renderer URLs", () => {
    const env = {
      KIRAKIRA_DESKTOP_RENDERER_URL: "http://127.0.0.1:5174",
    };

    expect(resolveDesktopRendererEndpoint(env)?.url).toBe("http://127.0.0.1:5174/");
    expect(desktopRendererUrl(env)).toBe("http://127.0.0.1:5174/");
    expect([...trustedDesktopRendererOrigins(env)]).toEqual(["http://127.0.0.1:5174"]);
  });

  it("preserves the legacy desktop dev URL env fallback", () => {
    expect(
      resolveDesktopRendererEndpoint({
        KIRAKIRA_DESKTOP_DEV_URL: "http://localhost:5174",
      })?.origin,
    ).toBe("http://localhost:5174");
  });

  it("does not invent a dev server URL when env is unset", () => {
    expect(resolveDesktopRendererEndpoint({})).toBeNull();
    expect(desktopRendererUrl({})).toBeNull();
    expect([...trustedDesktopRendererOrigins({})]).toEqual([]);
  });

  it("rejects non-loopback, https, and malformed renderer URLs", () => {
    expect(
      resolveDesktopRendererEndpoint({
        KIRAKIRA_DESKTOP_RENDERER_URL: "http://example.test:5174",
      }),
    ).toBeNull();
    expect(
      resolveDesktopRendererEndpoint({
        KIRAKIRA_DESKTOP_RENDERER_URL: "https://127.0.0.1:5174",
      }),
    ).toBeNull();
    expect(
      resolveDesktopRendererEndpoint({
        KIRAKIRA_DESKTOP_RENDERER_URL: "not a url",
      }),
    ).toBeNull();
  });

  it("trusts packaged file renderers and rejects unrelated local origins", () => {
    const env = {
      KIRAKIRA_DESKTOP_RENDERER_URL: "http://127.0.0.1:5174",
    };

    expect(isTrustedDesktopRuntimeSenderUrl("file:///app/renderer/index.html", env)).toBe(
      true,
    );
    expect(isTrustedDesktopRuntimeSenderUrl("http://127.0.0.1:5174/workbench", env)).toBe(
      true,
    );
    expect(isTrustedDesktopRuntimeSenderUrl("http://127.0.0.1:5173/", env)).toBe(false);
    expect(isTrustedDesktopRuntimeSenderUrl("http://example.test:5174/", env)).toBe(false);
  });
});
