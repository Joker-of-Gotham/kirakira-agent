/**
 * OIDC (OpenID Connect) authentication for MCP servers.
 *
 * Discovers the token endpoint from the OIDC well-known config, then
 * performs a client credentials exchange. Aligned with kirakira-agent-registry.md
 * §MCP Gateway auth adapter layer.
 */

export interface OidcAuthOptions {
  readonly issuerUrl: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly scopes?: string[];
}

interface OidcDiscovery {
  token_endpoint: string;
  issuer: string;
}

export async function applyOidcAuth(
  opts: OidcAuthOptions,
): Promise<Record<string, string>> {
  const wellKnownUrl = `${opts.issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;

  const discoveryRes = await fetch(wellKnownUrl, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!discoveryRes.ok) {
    throw new Error(
      `OIDC discovery failed (${discoveryRes.status}): ${wellKnownUrl}`,
    );
  }
  const discovery = (await discoveryRes.json()) as OidcDiscovery;

  if (!discovery.token_endpoint) {
    throw new Error("OIDC discovery response missing token_endpoint");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: opts.clientId,
  });
  if (opts.clientSecret) {
    body.set("client_secret", opts.clientSecret);
  }
  if (opts.scopes?.length) {
    body.set("scope", opts.scopes.join(" "));
  }

  const tokenRes = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    throw new Error(
      `OIDC token exchange failed (${tokenRes.status}): ${detail.slice(0, 300)}`,
    );
  }

  const json = (await tokenRes.json()) as {
    access_token?: string;
    token_type?: string;
  };
  if (!json.access_token) {
    throw new Error("OIDC token response missing access_token");
  }

  const tokenType = json.token_type ?? "Bearer";
  return { Authorization: `${tokenType} ${json.access_token}` };
}
