import { EamError } from "@kirakira/core";

export class AgentRuntimeError extends EamError {
  override name = "AgentRuntimeError";
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}

export class ModelInvocationError extends AgentRuntimeError {
  override name = "ModelInvocationError";
  constructor(message: string, options?: ErrorOptions) {
    super("MODEL_INVOCATION", message, options);
  }
}

export class ToolExecutionDeniedError extends AgentRuntimeError {
  override name = "ToolExecutionDeniedError";
  constructor(message: string, options?: ErrorOptions) {
    super("TOOL_EXECUTION_DENIED", message, options);
  }
}

export class ToolExecutionError extends AgentRuntimeError {
  override name = "ToolExecutionError";
  constructor(message: string, options?: ErrorOptions) {
    super("TOOL_EXECUTION", message, options);
  }
}

export class StructuredOutputError extends AgentRuntimeError {
  override name = "StructuredOutputError";
  constructor(message: string, options?: ErrorOptions) {
    super("STRUCTURED_OUTPUT", message, options);
  }
}

export class InterruptResumeError extends AgentRuntimeError {
  override name = "InterruptResumeError";
  constructor(message: string, options?: ErrorOptions) {
    super("INTERRUPT_RESUME", message, options);
  }
}

export class SandboxPathError extends AgentRuntimeError {
  override name = "SandboxPathError";
  constructor(message: string, options?: ErrorOptions) {
    super("SANDBOX_PATH", message, options);
  }
}
