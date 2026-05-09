import { EamError } from "@kirakira/core";

export class OrchestratorKernelError extends EamError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "OrchestratorKernelError";
  }
}

export class GraphCycleError extends OrchestratorKernelError {
  constructor(message: string) {
    super("GRAPH_CYCLE", message);
    this.name = "GraphCycleError";
  }
}

export class GraphValidationError extends OrchestratorKernelError {
  constructor(message: string) {
    super("GRAPH_VALIDATION", message);
    this.name = "GraphValidationError";
  }
}

export class CheckpointError extends OrchestratorKernelError {
  constructor(message: string, options?: ErrorOptions) {
    super("CHECKPOINT", message, options);
    this.name = "CheckpointError";
  }
}

export class ResumeError extends OrchestratorKernelError {
  constructor(message: string, options?: ErrorOptions) {
    super("RESUME", message, options);
    this.name = "ResumeError";
  }
}

export class PolicyPreflightError extends OrchestratorKernelError {
  constructor(message: string) {
    super("POLICY_PREFLIGHT", message);
    this.name = "PolicyPreflightError";
  }
}
