import type {
  PackageMeta,
  ResolveRequest,
  ResolveResult,
  SearchResult,
  TrustEntry,
} from "@kirakira/core";

export interface RegistryClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
  getAuthToken?: () => string | undefined;
}

export class RegistryClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly getAuthToken?: () => string | undefined;

  constructor(opts: RegistryClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchFn = opts.fetchFn ?? fetch;
    this.getAuthToken = opts.getAuthToken;
  }

  private headers(init?: Record<string, string>): Record<string, string> {
    const token = this.getAuthToken?.();
    return {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init,
    };
  }

  async search(q: string, kind?: string): Promise<SearchResult> {
    const url = new URL("/v1/search", `${this.baseUrl}/`);
    url.searchParams.set("q", q);
    if (kind) url.searchParams.set("kind", kind);
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`registry search failed: ${res.status}`);
    return (await res.json()) as SearchResult;
  }

  async getPackage(kind: string, name: string, version: string): Promise<PackageMeta> {
    const path = `/v1/packages/${encodeURIComponent(kind)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`registry package get failed: ${res.status}`);
    return (await res.json()) as PackageMeta;
  }

  async getBlob(digest: string): Promise<ArrayBuffer> {
    const path = `/v1/blobs/${encodeURIComponent(digest)}`;
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`registry blob get failed: ${res.status}`);
    return res.arrayBuffer();
  }

  async trust(): Promise<TrustEntry[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/trust/publishers`, { headers: this.headers() });
    if (!res.ok) throw new Error(`registry trust list failed: ${res.status}`);
    return (await res.json()) as TrustEntry[];
  }

  async publish(meta: PackageMeta, body: ArrayBuffer | Uint8Array): Promise<{ digest: string }> {
    const payload = {
      kind: meta.kind,
      name: meta.name,
      version: meta.version,
      digest: meta.digest,
      description: meta.description,
      blob_b64: Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : body).toString("base64"),
    };
    const res = await this.fetchFn(`${this.baseUrl}/v1/publish`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`registry publish failed: ${res.status}`);
    return (await res.json()) as { digest: string };
  }

  async resolve(req: ResolveRequest): Promise<ResolveResult> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/resolve`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`registry resolve failed: ${res.status}`);
    return (await res.json()) as ResolveResult;
  }

  async yank(kind: string, name: string, version: string): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/yank`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ kind, name, version }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `registry yank failed: ${res.status}${detail ? ` — ${detail.slice(0, 500)}` : ""}`,
      );
    }
  }
}
