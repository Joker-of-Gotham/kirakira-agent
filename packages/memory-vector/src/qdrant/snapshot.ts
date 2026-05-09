import type { QdrantClient } from "@qdrant/js-client-rest";

export class QdrantSnapshotService {
  constructor(private readonly client: QdrantClient) {}

  createSnapshot(collection: string) {
    return this.client.createSnapshot(collection, { wait: true });
  }

  listSnapshots(collection: string) {
    return this.client.listSnapshots(collection);
  }
}
