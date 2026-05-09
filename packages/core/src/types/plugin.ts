export type PluginKind = "command" | "import-adapter" | "renderer" | "registry";

export interface PluginMeta {
  name: string;
  version: string;
  kind: PluginKind;
  description?: string;
  enabled: boolean;
  path: string;
}

export interface CommandRegistry {
  register(name: string, handler: CommandHandler): void;
  registerSlash(name: string, handler: SlashHandler): void;
}

export interface CommandHandler {
  description: string;
  args?: Record<string, ArgDef>;
  run(args: Record<string, unknown>): Promise<void>;
}

export interface SlashHandler {
  description: string;
  run(args: string): Promise<void>;
}

export interface ArgDef {
  type: "string" | "boolean" | "number";
  required?: boolean;
  description?: string;
  default?: unknown;
}

export interface DetectInput {
  path: string;
  kind: "skill" | "mcp" | "plugin";
}

export interface DetectResult {
  format: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface NormalizeInput {
  path: string;
  format: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedArtifact {
  kind: "skill" | "mcp" | "plugin";
  manifest: Record<string, unknown>;
  files: string[];
  digest: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}
