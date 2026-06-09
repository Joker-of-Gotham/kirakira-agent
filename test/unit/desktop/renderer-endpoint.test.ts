import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

  it("trusts only the configured packaged file renderer and explicit local origins", () => {
    const env = {
      KIRAKIRA_DESKTOP_RENDERER_URL: "http://127.0.0.1:5174",
    };
    const packagedRendererUrl = pathToFileURL(
      resolve("apps/desktop/dist/renderer/index.html"),
    ).toString();
    const unrelatedFileUrl = pathToFileURL(resolve("other/index.html")).toString();

    expect(
      isTrustedDesktopRuntimeSenderUrl(packagedRendererUrl, env, {
        packagedRendererUrl,
      }),
    ).toBe(true);
    expect(
      isTrustedDesktopRuntimeSenderUrl(unrelatedFileUrl, env, {
        packagedRendererUrl,
      }),
    ).toBe(false);
    expect(isTrustedDesktopRuntimeSenderUrl(packagedRendererUrl, env)).toBe(false);
    expect(isTrustedDesktopRuntimeSenderUrl("http://127.0.0.1:5174/workbench", env)).toBe(
      true,
    );
    expect(isTrustedDesktopRuntimeSenderUrl("http://127.0.0.1:5173/", env)).toBe(false);
    expect(isTrustedDesktopRuntimeSenderUrl("http://example.test:5174/", env)).toBe(false);
  });
});
