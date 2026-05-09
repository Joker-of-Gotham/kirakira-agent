import type { z } from "zod";

import {
  actionKindSchema,
  airiskOutputSchema,
  approvalRecordSchema,
  approvalStatusSchema,
  obligationSchema,
  policyDecisionSchema,
  policyEffectSchema,
  policyInputSchema,
  policyScopeSchema,
  riskLevelSchema,
  sandboxNetworkModeSchema,
  sideEffectLevelSchema,
  sandboxProfileSchema,
  toolTypeSchema,
  obligationTypeSchema,
} from "../schemas/policy.js";

export type ActionKind = z.infer<typeof actionKindSchema>;
export type ToolType = z.infer<typeof toolTypeSchema>;
export type ObligationType = z.infer<typeof obligationTypeSchema>;

export type PolicyInput = z.infer<typeof policyInputSchema>;
export type AiriskOutput = z.infer<typeof airiskOutputSchema>;
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;
export type SandboxProfile = z.infer<typeof sandboxProfileSchema>;
export type Obligation = z.infer<typeof obligationSchema>;

export type PolicyEffect = z.infer<typeof policyEffectSchema>;
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type ApprovalScope = z.infer<typeof policyScopeSchema>;
export type SideEffectLevel = z.infer<typeof sideEffectLevelSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type SandboxNetworkMode = z.infer<typeof sandboxNetworkModeSchema>;
