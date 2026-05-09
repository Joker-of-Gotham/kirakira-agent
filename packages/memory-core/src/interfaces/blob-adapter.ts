export interface BlobMetadata {
  contentType: string;
  sha256: string;
  size: number;
  custom?: Record<string, string>;
}

export interface BlobObject {
  uri: string;
  body: Buffer | ReadableStream;
  metadata: BlobMetadata;
}

export interface BlobAdapter {
  put(uri: string, body: Buffer | ReadableStream, metadata: BlobMetadata): Promise<void>;
  get(uri: string): Promise<BlobObject | null>;
  head(uri: string): Promise<BlobMetadata | null>;
  delete(uri: string): Promise<void>;
  list(prefix: string, limit?: number): Promise<string[]>;
  setWormRetention(uri: string, retainUntil: string): Promise<void>;
  setLegalHold(uri: string, hold: boolean): Promise<void>;
  close(): Promise<void>;
}
