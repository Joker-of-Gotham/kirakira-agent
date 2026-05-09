export class EamError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EamError";
    this.code = code;
  }
}

export class ConfigError extends EamError {
  constructor(message: string, options?: ErrorOptions) {
    super("CONFIG_ERROR", message, options);
    this.name = "ConfigError";
  }
}

export class ConfigNotFoundError extends EamError {
  constructor(path: string) {
    super("CONFIG_NOT_FOUND", `Configuration file not found: ${path}`);
    this.name = "ConfigNotFoundError";
  }
}

export class SchemaValidationError extends EamError {
  readonly issues: unknown[];

  constructor(message: string, issues: unknown[]) {
    super("SCHEMA_VALIDATION", message);
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

export class SkillError extends EamError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "SkillError";
  }
}

export class SkillNotFoundError extends SkillError {
  constructor(name: string) {
    super("SKILL_NOT_FOUND", `Skill not found: ${name}`);
    this.name = "SkillNotFoundError";
  }
}

export class SkillValidationError extends SkillError {
  constructor(name: string, reason: string) {
    super("SKILL_VALIDATION", `Skill "${name}" validation failed: ${reason}`);
    this.name = "SkillValidationError";
  }
}

export class McpError extends EamError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "McpError";
  }
}

export class McpConnectionError extends McpError {
  constructor(serverName: string, reason: string) {
    super("MCP_CONNECTION", `MCP server "${serverName}": ${reason}`);
    this.name = "McpConnectionError";
  }
}

export class McpTimeoutError extends McpError {
  constructor(serverName: string, timeoutMs: number) {
    super(
      "MCP_TIMEOUT",
      `MCP server "${serverName}" timed out after ${timeoutMs}ms`,
    );
    this.name = "McpTimeoutError";
  }
}

export class RegistryError extends EamError {
  constructor(message: string, options?: ErrorOptions) {
    super("REGISTRY_ERROR", message, options);
    this.name = "RegistryError";
  }
}

export class ApprovalDeniedError extends EamError {
  constructor(action: string) {
    super("APPROVAL_DENIED", `Action denied by approval policy: ${action}`);
    this.name = "ApprovalDeniedError";
  }
}

export class SecurityError extends EamError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "SecurityError";
  }
}

export class PathTraversalError extends SecurityError {
  constructor(path: string) {
    super("PATH_TRAVERSAL", `Path traversal detected: ${path}`);
    this.name = "PathTraversalError";
  }
}

export class LockfileError extends EamError {
  constructor(message: string) {
    super("LOCKFILE_ERROR", message);
    this.name = "LockfileError";
  }
}

export class GatewayError extends EamError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "GatewayError";
  }
}

export class GatewayConnectionError extends GatewayError {
  constructor(message: string) {
    super("GATEWAY_CONNECTION", message);
    this.name = "GatewayConnectionError";
  }
}

export class GatewayTimeoutError extends GatewayError {
  constructor(timeoutMs: number) {
    super("GATEWAY_TIMEOUT", `Model gateway timed out after ${timeoutMs}ms`);
    this.name = "GatewayTimeoutError";
  }
}

export class ModelResolveError extends GatewayError {
  constructor(model: string, reason: string) {
    super("MODEL_RESOLVE", `Cannot resolve model "${model}": ${reason}`);
    this.name = "ModelResolveError";
  }
}

export class BudgetExceededError extends GatewayError {
  constructor(currentUsd: number, limitUsd: number) {
    super(
      "BUDGET_EXCEEDED",
      `Session cost $${currentUsd.toFixed(4)} exceeds budget $${limitUsd.toFixed(2)}`,
    );
    this.name = "BudgetExceededError";
  }
}

export class DigestMismatchError extends SecurityError {
  constructor(expected: string, actual: string) {
    super("DIGEST_MISMATCH", `Expected ${expected}, got ${actual}`);
    this.name = "DigestMismatchError";
  }
}

export class VerificationError extends SecurityError {
  constructor(message: string) {
    super("VERIFICATION_FAILED", message);
    this.name = "VerificationError";
  }
}
