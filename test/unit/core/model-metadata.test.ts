import { describe, expect, it } from "vitest";

import {
  MODEL_METADATA,
  MODEL_METADATA_CATALOG,
  estimateModelCostUsd,
  getModelMetadata,
  getModelPricing,
  modelSupportsCapability,
  resolveModelAlias,
} from "../../../packages/core/src/model-metadata.js";

describe("model metadata catalog", () => {
  it("centralizes aliases, context, capabilities, and pricing", () => {
    expect(MODEL_METADATA_CATALOG.schemaVersion).toBe(1);
    expect(MODEL_METADATA.length).toBeGreaterThan(0);
    expect(resolveModelAlias("gpt-4o")).toBe("gpt-4o-2024-11-20");
    expect(resolveModelAlias("gpt-4o-2024-11-20")).toBe("gpt-4o");
    expect(resolveModelAlias("claude-opus")).toBe("claude-opus-4-8");

    const gpt4o = getModelMetadata("gpt-4o-2024-11-20");
    expect(gpt4o?.contextWindow).toBe(128_000);
    expect(gpt4o?.capabilities.functionCalling).toBe(true);
    expect(gpt4o?.capabilities.mcpTools).toBe(true);
    expect(gpt4o?.pricing?.inputPerMillionUsd).toBe(2.5);
  });

  it("keeps embedding metadata explicit instead of inferred from model names", () => {
    const embedding = getModelMetadata("text-embedding-3-small");
    expect(embedding?.capabilities.embedding).toBe(true);
    expect(embedding?.capabilities.functionCalling).toBe(false);
    expect(modelSupportsCapability("gpt-4o", "embedding")).toBe(false);
  });

  it("estimates costs from shared metadata and defaults unknown models to zero", () => {
    expect(estimateModelCostUsd("gpt-4o", 1000, 500)).toBe((1000 * 2.5 + 500 * 10) / 1_000_000);
    expect(getModelPricing("unknown-self-hosted-model")).toBeUndefined();
    expect(estimateModelCostUsd("unknown-self-hosted-model", 1000, 500)).toBe(0);
  });
});
