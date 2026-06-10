import catalog from "./model-metadata.catalog.json" with { type: "json" };

export interface ModelPricingMetadata {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export interface ModelCapabilityMetadata {
  functionCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  streaming: boolean;
  mcpTools: boolean;
  reasoning?: boolean;
  memory?: boolean;
  toolSearch?: boolean;
  embedding: boolean;
  longContext: boolean;
  requiresApproval?: boolean;
}

export interface ModelClassMetadata {
  price: "low" | "medium" | "premium";
  latency: "fast" | "medium" | "slow";
  dataResidency: "us" | "local" | string;
}

export interface ModelMetadataEntry {
  id: string;
  provider: string;
  aliases: readonly string[];
  contextWindow: number;
  maxOutputTokens: number;
  pricing?: ModelPricingMetadata;
  capabilities: ModelCapabilityMetadata;
  classes: ModelClassMetadata;
}

export interface ModelMetadataCatalog {
  schemaVersion: number;
  sources: readonly string[];
  aliases: Readonly<Record<string, string>>;
  models: readonly ModelMetadataEntry[];
}

export const MODEL_METADATA_CATALOG = Object.freeze({
  ...catalog,
  sources: Object.freeze([...catalog.sources]),
  aliases: Object.freeze({ ...catalog.aliases }),
  models: Object.freeze(catalog.models.map((model) => Object.freeze({
    ...model,
    aliases: Object.freeze([...model.aliases]),
    pricing: model.pricing ? Object.freeze({ ...model.pricing }) : undefined,
    capabilities: Object.freeze({ ...model.capabilities }),
    classes: Object.freeze({ ...model.classes }),
  }))),
}) as ModelMetadataCatalog;

export const MODEL_METADATA: readonly ModelMetadataEntry[] = MODEL_METADATA_CATALOG.models;

const MODEL_ALIAS_MAP = new Map<string, string>(
  Object.entries(MODEL_METADATA_CATALOG.aliases).map(([alias, target]) => [normalizeModelKey(alias), target]),
);

for (const model of MODEL_METADATA) {
  if (!MODEL_ALIAS_MAP.has(normalizeModelKey(model.id))) {
    MODEL_ALIAS_MAP.set(normalizeModelKey(model.id), model.id);
  }
  for (const alias of model.aliases) {
    if (!MODEL_ALIAS_MAP.has(normalizeModelKey(alias))) {
      MODEL_ALIAS_MAP.set(normalizeModelKey(alias), model.id);
    }
  }
}

export function resolveModelAlias(model: string): string {
  const trimmed = model.trim();
  return MODEL_ALIAS_MAP.get(normalizeModelKey(trimmed)) ?? trimmed;
}

export function getModelMetadata(model: string): ModelMetadataEntry | undefined {
  const resolved = resolveModelAlias(model);
  const normalized = normalizeModelKey(resolved);
  return MODEL_METADATA.find((entry) => normalizeModelKey(entry.id) === normalized)
    ?? MODEL_METADATA.find((entry) => entry.aliases.some((alias) => normalizeModelKey(alias) === normalized));
}

export function getModelPricing(model: string): ModelPricingMetadata | undefined {
  return getModelMetadata(model)?.pricing;
}

export function modelSupportsCapability(
  model: string,
  capability: keyof ModelCapabilityMetadata,
): boolean {
  return Boolean(getModelMetadata(model)?.capabilities[capability]);
}

export function estimateModelCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;
  return ((inputTokens * pricing.inputPerMillionUsd) + (outputTokens * pricing.outputPerMillionUsd)) / 1_000_000;
}

function normalizeModelKey(value: string): string {
  return value.trim().toLowerCase();
}
