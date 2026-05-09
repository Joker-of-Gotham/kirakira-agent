export type SkillSourceType =
  | "registry"
  | "local"
  | "imported-claude"
  | "imported-codex"
  | "imported-cursor"
  | "imported-copilot"
  | "imported-gemini"
  | "github"
  | "npm";

export type SkillTrustLevel =
  | "internal-signed"
  | "enterprise-allow"
  | "user-approved"
  | "ask"
  | "untrusted";

export type SkillActivationMode = "auto-or-explicit" | "explicit-only" | "auto";

export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  compatibility?: string;
  owner?: string;
  allowedTools?: string[];
  activation?: string[];
  riskLevel?: string;
  requiresApprovalFor?: string[];
  metadata?: Record<string, unknown>;
}

export interface SkillMeta {
  name: string;
  description: string;
  path: string;
  tags: string[];
  trust: SkillTrustLevel;
  source: SkillSourceType;
  version?: string;
  namespace?: string;
  activation?: string[];
}

export interface SkillManifest {
  kind: "skill";
  schemaVersion: number;
  name: string;
  displayName: string;
  source: {
    type: SkillSourceType;
    path: string;
  };
  trust: {
    level: SkillTrustLevel;
    publisher: string;
  };
  activation: {
    mode: SkillActivationMode;
    aliases: string[];
  };
  files: {
    entry: string;
    scripts: string[];
    references: string[];
  };
  compat: {
    format: string;
    importedFrom?: string;
  };
}

export interface SkillContent {
  frontmatter: SkillFrontmatter;
  body: string;
  scripts: string[];
  references: string[];
}
