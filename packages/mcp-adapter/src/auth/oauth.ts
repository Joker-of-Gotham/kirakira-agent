/**
 * OAuth 2.0 Client Credentials flow for MCP server authentication.
 *
 * Exchanges client credentials at the token endpoint for an access token,
 * then returns headers suitable for authenticated MCP requests.
 */
export interface OauthAuthOptions {
  readonly issuerUrl?: string;
  readonly tokenUrl?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly scopes?: string[];
}

export async function applyOauthAuth(
  opts: OauthAuthOptions,
): Promise<Record<string, string>> {
  const tokenUrl = opts.tokenUrl ?? (opts.issuerUrl ? `${opts.issuerUrl.replace(/\/$/, "")}/oauth/token` : "");
  if (!tokenUrl) {
    throw new Error(
      "OAuth auth requires tokenUrl or issuerUrl. Set one in your MCP server config.",
    );
  }
  if (!opts.clientId) {
    throw new Error("OAuth auth requires clientId.");
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

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OAuth token request failed: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const json = (await res.json()) as { access_token?: string; token_type?: string };

  if (!json.access_token) {
    throw new Error("OAuth token response missing access_token");
  }

  const tokenType = json.token_type ?? "Bearer";
  return {
    Authorization: `${tokenType} ${json.access_token}`,
  };
}
