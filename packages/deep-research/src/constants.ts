import type {
  DeepResearchCitationSchema,
  DeepResearchLimits,
  DeepResearchOutputHeading,
  ResearchSourceKind,
} from "./types.js";

export const DEFAULT_DEEP_RESEARCH_LIMITS: DeepResearchLimits = {
  maxDepth: 3,
  maxBreadth: 4,
  maxToolCalls: 24,
};

export const DEEP_RESEARCH_LIMIT_CEILINGS: DeepResearchLimits = {
  maxDepth: 8,
  maxBreadth: 16,
  maxToolCalls: 128,
};

export const DEFAULT_DEEP_RESEARCH_WORKSPACE_DIR = ".kirakira/research";

export const WORKSPACE_SOURCE_KINDS: readonly ResearchSourceKind[] = [
  "memory",
  "file",
];

export const WEB_SOURCE_KINDS: readonly ResearchSourceKind[] = ["web"];

export const HYBRID_SOURCE_KINDS: readonly ResearchSourceKind[] = [
  "memory",
  "file",
  "web",
];

export const VERIFIED_SOURCE_KINDS: readonly ResearchSourceKind[] = [
  "memory",
  "file",
  "web",
  "mcp",
];

export const DEEP_RESEARCH_OUTPUT_HEADINGS: readonly DeepResearchOutputHeading[] =
  [
    "Answer",
    "Evidence used",
    "Actions taken",
    "Open uncertainties",
    "Failed tool calls",
    "Recommended next step",
  ];

export const DEFAULT_DEEP_RESEARCH_CITATION_SCHEMA: DeepResearchCitationSchema =
  {
    required: true,
    minCitationsPerFinding: 1,
    acceptedSourceKinds: [...HYBRID_SOURCE_KINDS],
    includeTraceMetadata: true,
  };
