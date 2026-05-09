import { EamError } from "@kirakira/core";

export class MemoryError extends EamError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "MemoryError";
  }
}

export class RetainError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("MEMORY_RETAIN", message, options);
    this.name = "RetainError";
  }
}

export class RecallError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("MEMORY_RECALL", message, options);
    this.name = "RecallError";
  }
}

export class RecallRouteError extends RecallError {
  readonly routeName: string;
  constructor(routeName: string, message: string, options?: ErrorOptions) {
    super(`Route "${routeName}": ${message}`, options);
    this.name = "RecallRouteError";
    this.routeName = routeName;
  }
}

export class ReflectError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("MEMORY_REFLECT", message, options);
    this.name = "ReflectError";
  }
}

export class CheckpointError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("MEMORY_CHECKPOINT", message, options);
    this.name = "CheckpointError";
  }
}

export class RestoreError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("MEMORY_RESTORE", message, options);
    this.name = "RestoreError";
  }
}

export class ForgetError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("MEMORY_FORGET", message, options);
    this.name = "ForgetError";
  }
}

export class ExportError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("MEMORY_EXPORT", message, options);
    this.name = "ExportError";
  }
}

export class StoreConnectionError extends MemoryError {
  readonly storeName: string;
  constructor(storeName: string, message: string, options?: ErrorOptions) {
    super("STORE_CONNECTION", `Store "${storeName}": ${message}`, options);
    this.name = "StoreConnectionError";
    this.storeName = storeName;
  }
}

export class StoreMigrationError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("STORE_MIGRATION", message, options);
    this.name = "StoreMigrationError";
  }
}

export class VectorAdapterError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("VECTOR_ADAPTER", message, options);
    this.name = "VectorAdapterError";
  }
}

export class GraphAdapterError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("GRAPH_ADAPTER", message, options);
    this.name = "GraphAdapterError";
  }
}

export class BlobAdapterError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("BLOB_ADAPTER", message, options);
    this.name = "BlobAdapterError";
  }
}

export class NamespaceViolationError extends MemoryError {
  constructor(namespace: string, message: string) {
    super("NAMESPACE_VIOLATION", `Namespace "${namespace}": ${message}`);
    this.name = "NamespaceViolationError";
  }
}

export class PiiViolationError extends MemoryError {
  constructor(message: string) {
    super("PII_VIOLATION", message);
    this.name = "PiiViolationError";
  }
}

export class OutboxError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("OUTBOX_ERROR", message, options);
    this.name = "OutboxError";
  }
}

export class EmbeddingError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("EMBEDDING_ERROR", message, options);
    this.name = "EmbeddingError";
  }
}
