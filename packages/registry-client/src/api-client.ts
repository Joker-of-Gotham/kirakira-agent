/**
 * Enterprise registry REST API client.
 *
 * Endpoints aligned with docs/plane/kirakira-agent-registry.md:
 *   GET    /v1/search?q=&kind=&page=&per_page=
 *   GET    /v1/packages/:kind/:name/:version
 *   GET    /v1/blobs/:digest
 *   POST   /v1/publish
 *   POST   /v1/resolve
 *   POST   /v1/yank
 *   GET    /v1/trust/publishers
 */

import type {
  PackageKind,
  PackageMeta,
  PublishResult,
  RegistryAuth,
  SearchResult,
} from "./types.js";

export interface ApiClientOptions {
  baseUrl: string;
  auth?: RegistryAuth;
  timeout?: number;
}

export class RegistryApiClient {
  private readonly baseUrl: string;
  private readonly auth?: RegistryAuth;
  private readonly timeout: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.auth = options.auth;
    this.timeout = options.timeout ?? 30_000;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.auth?.token) {
      h.Authorization = `Bearer ${this.auth.token}`;
    }
    return h;
  }

  async search(opts: {
    query?: string;
    kind?: PackageKind;
    page?: number;
    perPage?: number;
    tags?: string[];
  }): Promise<SearchResult> {
    const params = new URLSearchParams();
    if (opts.query) params.set("q", opts.query);
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.page) params.set("page", String(opts.page));
    if (opts.perPage) params.set("per_page", String(opts.perPage));
    if (opts.tags?.length) params.set("tags", opts.tags.join(","));

    const url = `${this.baseUrl}/v1/search?${params}`;
    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as SearchResult;
  }

  async getPackage(
    kind: PackageKind,
    name: string,
    version: string,
  ): Promise<PackageMeta> {
    const url = `${this.baseUrl}/v1/packages/${kind}/${encodeURIComponent(name)}/${version}`;
    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as PackageMeta;
  }

  async downloadBlob(digest: string): Promise<ArrayBuffer> {
    const hash = digest.replace("sha256:", "");
    const url = `${this.baseUrl}/v1/blobs/${hash}`;
    const res = await fetch(url, {
      headers: {
        ...this.headers(),
        Accept: "application/octet-stream",
      },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
    return res.arrayBuffer();
  }

  async publish(data: {
    kind: PackageKind;
    name: string;
    version: string;
    digest: string;
    description?: string;
    tags?: string[];
    blob: Uint8Array;
  }): Promise<PublishResult> {
    const url = `${this.baseUrl}/v1/publish`;
    const body = {
      kind: data.kind,
      name: data.name,
      version: data.version,
      digest: data.digest,
      description: data.description,
      tags: data.tags,
      blob_b64: Buffer.from(data.blob).toString("base64"),
    };
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as PublishResult;
  }

  async yank(kind: PackageKind, name: string, version: string, reason?: string): Promise<void> {
    const url = `${this.baseUrl}/v1/yank`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ kind, name, version, reason }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
  }

  async quarantine(kind: PackageKind, name: string, version: string, reason: string): Promise<void> {
    const url = `${this.baseUrl}/v1/quarantine`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ kind, name, version, reason }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
  }

  async archive(kind: PackageKind, name: string, version: string): Promise<void> {
    const url = `${this.baseUrl}/v1/archive`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ kind, name, version }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
  }

  async listNamespaces(): Promise<Array<{ prefix: string; owner: string; reserved: boolean }>> {
    const url = `${this.baseUrl}/v1/namespaces`;
    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as Array<{ prefix: string; owner: string; reserved: boolean }>;
  }

  async resolve(
    packages: Array<{ kind: PackageKind; name: string; versionRange?: string }>,
  ): Promise<{
    resolved: Array<{ kind: PackageKind; name: string; version: string; digest: string; blobUrl: string }>;
    conflicts: Array<{ name: string; reason: string }>;
  }> {
    const url = `${this.baseUrl}/v1/resolve`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ packages }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as {
      resolved: Array<{ kind: PackageKind; name: string; version: string; digest: string; blobUrl: string }>;
      conflicts: Array<{ name: string; reason: string }>;
    };
  }

  async listTrustedPublishers(): Promise<Array<{ id: string; name: string; fingerprint?: string }>> {
    const url = `${this.baseUrl}/v1/trust/publishers`;
    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as Array<{ id: string; name: string; fingerprint?: string }>;
  }

  private async toError(res: Response): Promise<Error> {
    const body = await res.text().catch(() => "");
    return new Error(`Registry API ${res.status}: ${body.slice(0, 500)}`);
  }
}
