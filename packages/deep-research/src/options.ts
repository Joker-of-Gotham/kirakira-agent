import { isAbsolute, relative, resolve } from "node:path";
import {
  isPathWithin,
  type DeepResearchConfig,
  type ResearchSourcePolicy,
} from "@kirakira/core";

import {
  DEFAULT_DEEP_RESEARCH_LIMITS,
  DEFAULT_DEEP_RESEARCH_WORKSPACE_DIR,
  DEEP_RESEARCH_LIMIT_CEILINGS,
  HYBRID_SOURCE_KINDS,
  VERIFIED_SOURCE_KINDS,
  WEB_SOURCE_KINDS,
  WORKSPACE_SOURCE_KINDS,
} from "./constants.js";
import type {
  DeepResearchLimits,
  ResearchSourceKind,
  ResolvedDeepResearchOptions,
} from "./types.js";

const POLICY_SOURCE_KINDS: Record<
  ResearchSourcePolicy,
  readonly ResearchSourceKind[]
> = {
  workspace: WORKSPACE_SOURCE_KINDS,
  web: WEB_SOURCE_KINDS,
  hybrid: HYBRID_SOURCE_KINDS,
  verified: VERIFIED_SOURCE_KINDS,
};

export interface ResolveDeepResearchOptionsInput {
  availableSourceKinds?: ResearchSourceKind[];
}

export function resolveDeepResearchOptions(
  config: DeepResearchConfig | undefined,
  workspaceRoot: string,
  input: ResolveDeepResearchOptionsInput = {},
): ResolvedDeepResearchOptions {
  const root = resolve(workspaceRoot);
  const workspaceDirSetting =
    config?.workspace_dir ?? DEFAULT_DEEP_RESEARCH_WORKSPACE_DIR;
  const workspaceDir = resolve(
    isAbsolute(workspaceDirSetting)
      ? workspaceDirSetting
      : resolve(root, workspaceDirSetting),
  );

  if (!isPathWithin(root, workspaceDir)) {
    throw new Error(
      `deep_research.workspace_dir must stay inside workspace root: ${workspaceDir}`,
    );
  }

  const sourcePolicy = config?.source_policy ?? "hybrid";
  const requireCitations =
    sourcePolicy === "verified" || (config?.require_citations ?? true);

  return {
    enabled: config?.enabled ?? false,
    sourcePolicy,
    limits: normalizeLimits(config),
    requireCitations,
    verificationRequired: sourcePolicy === "verified",
    workspaceRoot: root,
    workspaceDir,
    workspaceDirRelative: relative(root, workspaceDir) || ".",
    requiredSourceKinds: selectSourceKinds(
      sourcePolicy,
      undefined,
      input.availableSourceKinds,
    ),
  };
}

export function selectSourceKinds(
  sourcePolicy: ResearchSourcePolicy,
  requestedKinds?: readonly ResearchSourceKind[],
  availableKinds?: readonly ResearchSourceKind[],
): ResearchSourceKind[] {
  const allowedKinds = POLICY_SOURCE_KINDS[sourcePolicy];
  const requested = requestedKinds?.length ? requestedKinds : allowedKinds;
  const available = availableKinds?.length ? new Set(availableKinds) : undefined;

  const selected: ResearchSourceKind[] = [];
  for (const kind of requested) {
    if (!allowedKinds.includes(kind)) {
      throw new Error(
        `Source kind "${kind}" is not allowed by deep_research.source_policy="${sourcePolicy}"`,
      );
    }
    if (available && !available.has(kind)) {
      if (requestedKinds?.length) {
        throw new Error(`Requested source kind "${kind}" is not available`);
      }
      continue;
    }
    if (!selected.includes(kind)) {
      selected.push(kind);
    }
  }

  if (selected.length === 0) {
    throw new Error(
      `No source kinds are available for deep_research.source_policy="${sourcePolicy}"`,
    );
  }

  return selected;
}

function normalizeLimits(config: DeepResearchConfig | undefined): DeepResearchLimits {
  return {
    maxDepth: normalizePositiveInteger(
      config?.max_depth,
      DEFAULT_DEEP_RESEARCH_LIMITS.maxDepth,
      DEEP_RESEARCH_LIMIT_CEILINGS.maxDepth,
    ),
    maxBreadth: normalizePositiveInteger(
      config?.max_breadth,
      DEFAULT_DEEP_RESEARCH_LIMITS.maxBreadth,
      DEEP_RESEARCH_LIMIT_CEILINGS.maxBreadth,
    ),
    maxToolCalls: normalizePositiveInteger(
      config?.max_tool_calls,
      DEFAULT_DEEP_RESEARCH_LIMITS.maxToolCalls,
      DEEP_RESEARCH_LIMIT_CEILINGS.maxToolCalls,
    ),
  };
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  ceiling: number,
): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }
  const normalized = Math.floor(value);
  if (normalized <= 0) {
    return fallback;
  }
  return Math.min(normalized, ceiling);
}
