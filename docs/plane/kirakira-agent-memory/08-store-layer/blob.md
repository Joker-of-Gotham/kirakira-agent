# Blob storage — S3, MinIO, and local development

Large payloads and binary artifacts are stored in **object storage**. Postgres (`artifact_meta`, `episodes.body_blob_uri`, checkpoint manifests) holds **pointers and integrity metadata** (`sha256`, `bytes`, `worm`).

Implementation reference: `packages/memory-store/src/blob/s3-client.ts` (**AWS SDK v3** `PutObject`, `GetObject`, `HeadObject`).

---

## S3 / MinIO adapter

`S3BlobClient` wraps `@aws-sdk/client-s3` with a configured bucket.

### Operations

| Operation | SDK command | Notes |
|-----------|-------------|------|
| **put** | `PutObjectCommand` | Optional `ContentType` |
| **get** | `GetObjectCommand` | `transformToByteArray()` on body |
| **head** | `HeadObjectCommand` | Returns `contentLength`, `contentType` |
| **delete** | `DeleteObjectCommand` | *Not present in current class—add when tombstone / GC is implemented* |
| **list** | `ListObjectsV2Command` | *Not present in current class—add for GC, auditing, or migration* |

Example usage:

```typescript
import { S3BlobClient } from "@kirakira/memory-store/blob/s3-client";

const blobs = new S3BlobClient({
  bucket: process.env.S3_BUCKET!,
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT, // MinIO: e.g. http://localhost:9000
  forcePathStyle: true,              // often required for MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

await blobs.putObject(key, compressedBytes, "application/zstd");
const bytes = await blobs.getObjectBytes(key);
const meta = await blobs.headObject(key);
```

**MinIO** is S3-compatible: set `endpoint`, `forcePathStyle`, and static credentials. For production IAM roles on AWS, omit explicit credentials and rely on the default provider chain.

---

## Path conventions

Keep keys **hierarchical** so lifecycle rules, listings, and human navigation are tractable.

### Episodes (compressed JSON example)

```text
tenants/{tenant_id}/workspaces/{workspace_id}/episodes/yyyy/mm/dd/{episode_id}.json.zst
```

Example:

```text
tenants/acme/workspaces/proj-42/episodes/2026/05/06/550e8400-e29b-41d4-a716-446655440000.json.zst
```

### Artifacts (versioned payload)

```text
tenants/{tenant_id}/workspaces/{workspace_id}/artifacts/{artifact_id}/v{n}/payload.bin
```

### Checkpoints

```text
tenants/{tenant_id}/runs/{run_id}/checkpoints/{step_no}.msgpack.zst
```

### Exports and audit

```text
tenants/{tenant_id}/exports/{job_id}/manifest.json
audit/{yyyy}/{mm}/{dd}/{audit_id}.json
```

Constants for segment names also appear in `BLOB_PATHS` (`memory-core`): `episodes`, `artifacts`, `checkpoints`, `exports`, `audit`.

---

## WORM retention

**Write once, read many (WORM)** policies protect objects from overwrite or early deletion.

### Compliance mode

- Objects cannot be deleted or shortened until **retention expires**.
- No privileged bypass—use only when regulation requires strict immutability.
- Map to S3 **Object Lock** in compliance mode or MinIO **object locking** equivalents.

### Governance mode

- Retention rules exist, but **privileged users** can adjust holds or retention in emergencies.
- Prefer governance for most internal “immutable audit” use cases.

Store intent in `artifact_meta.worm` and in object tags or metadata so workers respect retention class when issuing deletes.

---

## Legal hold management

A **legal hold** blocks deletion independent of retention expiry until the hold is released.

Recommended practice:

1. Record holds in Postgres (`artifact_meta.metadata`, or a dedicated compliance table) with `hold_id`, reason, actor, timestamps.
2. Apply vendor-native **legal hold** flags on underlying objects when available.
3. **Forget / deletion jobs** must check holds **before** enqueueing physical delete; if held, mark job `blocked_legal_hold` with a clear error for operators.

---

## Local filesystem adapter (development)

For unit tests or offline dev, implement the same logical interface against the OS:

```typescript
export interface BlobStore {
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  getObjectBytes(key: string): Promise<Uint8Array>;
  headObject(key: string): Promise<{ contentLength?: number; contentType?: string }>;
  deleteObject?(key: string): Promise<void>;
  listPrefix?(prefix: string): Promise<string[]>;
}

/** Keys map to {root}/{key} with mkdir -p on put. */
export class FsBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  async putObject(key: string, body: Uint8Array, contentType?: string): Promise<void> {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    if (contentType) {
      await writeFile(path + ".meta.json", JSON.stringify({ contentType }));
    }
  }

  async getObjectBytes(key: string): Promise<Uint8Array> {
    return readFile(join(this.root, key));
  }

  async headObject(key: string): Promise<{ contentLength?: number; contentType?: string }> {
    const path = join(this.root, key);
    const st = await stat(path);
    let contentType: string | undefined;
    try {
      const raw = await readFile(path + ".meta.json", "utf8");
      contentType = JSON.parse(raw).contentType;
    } catch {
      /* no sidecar */
    }
    return { contentLength: st.size, contentType };
  }
}
```

Use a **temporary directory per test** or a docker volume for persistence.

---

## Version management

- **Content-addressable** storage: `sha256` in `artifact_meta` catches silent corruption and supports deduplication.
- **Numeric versions** (`v{n}` path segments): keep prior versions when regenerating thumbnails, OCR output, or derived encodings; point “current” via metadata or the latest `n`.
- **Immutability**: prefer writing a **new** key per version; avoid in-place overwrites for governed artifacts.

---

## Related reading

- [`postgres.md`](postgres.md) — `artifact_meta` table
- [`README.md`](README.md) — store layer overview
