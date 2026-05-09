import { EamError } from "@kirakira/core";
import { describe, expect, it } from "vitest";
import {
  BlobAdapterError,
  CheckpointError,
  EmbeddingError,
  ExportError,
  ForgetError,
  GraphAdapterError,
  MemoryError,
  NamespaceViolationError,
  OutboxError,
  PiiViolationError,
  RecallError,
  RecallRouteError,
  ReflectError,
  RestoreError,
  RetainError,
  StoreConnectionError,
  StoreMigrationError,
  VectorAdapterError,
} from "@kirakira/memory-core";

describe("MemoryError", () => {
  it("extends EamError", () => {
    const err = new MemoryError("MEMORY_TEST", "test");
    expect(err).toBeInstanceOf(EamError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("MEMORY_TEST");
    expect(err.name).toBe("MemoryError");
  });
});

describe("operation errors extend MemoryError", () => {
  const cases: { Ctor: new (msg: string) => MemoryError; code: string; name: string }[] = [
    { Ctor: RetainError, code: "MEMORY_RETAIN", name: "RetainError" },
    { Ctor: RecallError, code: "MEMORY_RECALL", name: "RecallError" },
    { Ctor: ReflectError, code: "MEMORY_REFLECT", name: "ReflectError" },
    { Ctor: CheckpointError, code: "MEMORY_CHECKPOINT", name: "CheckpointError" },
    { Ctor: RestoreError, code: "MEMORY_RESTORE", name: "RestoreError" },
    { Ctor: ForgetError, code: "MEMORY_FORGET", name: "ForgetError" },
    { Ctor: ExportError, code: "MEMORY_EXPORT", name: "ExportError" },
  ];

  it.each(cases)("$name has code $code and extends MemoryError", ({ Ctor, code, name }) => {
    const err = new Ctor("boom");
    expect(err).toBeInstanceOf(MemoryError);
    expect(err).toBeInstanceOf(EamError);
    expect(err.code).toBe(code);
    expect(err.name).toBe(name);
  });
});

describe("RecallRouteError", () => {
  it("extends RecallError and exposes routeName", () => {
    const err = new RecallRouteError("vector", "timeout");
    expect(err).toBeInstanceOf(RecallError);
    expect(err).toBeInstanceOf(MemoryError);
    expect(err.routeName).toBe("vector");
    expect(err.code).toBe("MEMORY_RECALL");
    expect(err.name).toBe("RecallRouteError");
    expect(err.message).toContain("vector");
  });
});

describe("StoreConnectionError", () => {
  it("has storeName and adapter-specific code", () => {
    const err = new StoreConnectionError("redis", "unreachable");
    expect(err).toBeInstanceOf(MemoryError);
    expect(err.storeName).toBe("redis");
    expect(err.code).toBe("STORE_CONNECTION");
    expect(err.name).toBe("StoreConnectionError");
    expect(err.message).toContain("redis");
  });
});

describe("adapter errors extend MemoryError", () => {
  it.each([
    { Ctor: VectorAdapterError, code: "VECTOR_ADAPTER", name: "VectorAdapterError" },
    { Ctor: GraphAdapterError, code: "GRAPH_ADAPTER", name: "GraphAdapterError" },
    { Ctor: BlobAdapterError, code: "BLOB_ADAPTER", name: "BlobAdapterError" },
  ] as const)("$name", ({ Ctor, code, name }) => {
    const err = new Ctor("fail");
    expect(err).toBeInstanceOf(MemoryError);
    expect(err.code).toBe(code);
    expect(err.name).toBe(name);
  });
});

describe("policy / pipeline errors extend MemoryError", () => {
  it("NamespaceViolationError", () => {
    const err = new NamespaceViolationError("org", "cross-tenant");
    expect(err).toBeInstanceOf(MemoryError);
    expect(err.code).toBe("NAMESPACE_VIOLATION");
    expect(err.name).toBe("NamespaceViolationError");
  });

  it("PiiViolationError", () => {
    const err = new PiiViolationError("high pii in low channel");
    expect(err).toBeInstanceOf(MemoryError);
    expect(err.code).toBe("PII_VIOLATION");
    expect(err.name).toBe("PiiViolationError");
  });

  it.each([
    { Ctor: OutboxError, code: "OUTBOX_ERROR", name: "OutboxError" },
    { Ctor: EmbeddingError, code: "EMBEDDING_ERROR", name: "EmbeddingError" },
  ] as const)("$name", ({ Ctor, code, name }) => {
    const err = new Ctor("bad");
    expect(err).toBeInstanceOf(MemoryError);
    expect(err.code).toBe(code);
    expect(err.name).toBe(name);
  });

  it("StoreMigrationError", () => {
    const err = new StoreMigrationError("v2 pending");
    expect(err).toBeInstanceOf(MemoryError);
    expect(err.code).toBe("STORE_MIGRATION");
    expect(err.name).toBe("StoreMigrationError");
  });
});

describe("Error cause chaining", () => {
  it("propagates cause through ErrorOptions", () => {
    const root = new Error("root");
    const err = new RetainError("wrapper", { cause: root });
    expect(err.cause).toBe(root);
  });

  it("works for RecallRouteError", () => {
    const root = new Error("upstream");
    const err = new RecallRouteError("graph", "expand failed", { cause: root });
    expect(err.cause).toBe(root);
  });
});
