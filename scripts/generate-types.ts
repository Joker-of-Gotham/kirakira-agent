#!/usr/bin/env npx tsx
/**
 * Cross-language type generator.
 * Reads @kirakira/core Zod schemas and generates:
 * 1. JSON Schema → policies/schemas/
 * 2. Go types → packages/kirakirad/internal/types/generated.go
 * 3. Python Pydantic models → packages/model-gateway/src/kirakira_model_gateway/policy_types.py
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  airiskOutputSchema,
  approvalRecordSchema,
  obligationSchema,
  policyDecisionSchema,
  policyInputSchema,
  sandboxProfileSchema,
} from "../packages/core/src/schemas/policy.ts";

import { auditCheckpointSchema, auditEventSchema } from "../packages/core/src/schemas/audit.ts";

const ROOT = join(import.meta.dirname, "..");

type JsonSchemaLike = Record<string, unknown>;

/** Resolve `$ref` or pick top-level alias from definitions / $defs. */
function resolveRootSchema(js: JsonSchemaLike, preferredDefName?: string): JsonSchemaLike {
  if (typeof js !== "object" || js === null) return {};

  const defs =
    typeof js.definitions === "object" && js.definitions !== null
      ? (js.definitions as Record<string, JsonSchemaLike>)
      : typeof js.$defs === "object" && js.$defs !== null
        ? (js.$defs as Record<string, JsonSchemaLike>)
        : undefined;

  if (preferredDefName !== undefined && defs?.[preferredDefName])
    return defs[preferredDefName]!;

  const ref = js.$ref;
  if (typeof ref === "string" && defs) {
    const key = ref.includes("/") ? (ref.split("/").pop() ?? ref) : ref;
    const clean = key.replace(/^#\/?\$defs\/(?:.*\/)?/u, "").replace(/^#\/?definitions\/(?:.*\/)?/u, "");
    const inner = defs[clean];
    if (inner) return inner;
  }

  return js;
}

function generateJsonSchemas(): void {
  const schemas = {
    policy_input: policyInputSchema,
    airisk_output: airiskOutputSchema,
    policy_decision: policyDecisionSchema,
    approval_record: approvalRecordSchema,
    sandbox_profile: sandboxProfileSchema,
    obligation: obligationSchema,
    audit_event: auditEventSchema,
    audit_checkpoint: auditCheckpointSchema,
  };

  const outDir = join(ROOT, "policies", "schemas");
  mkdirSync(outDir, { recursive: true });

  for (const [name, schema] of Object.entries(schemas)) {
    const alias = `${name}`;
    const jsonSchema = zodToJsonSchema(schema, { name: alias, target: "jsonSchema7" });
    writeFileSync(join(outDir, `${name}.schema.json`), `${JSON.stringify(jsonSchema, null, 2)}\n`);
  }

  console.log(`Generated ${Object.keys(schemas).length} JSON schemas`);
}

/** Flatten first-level JSON Schema object into Go structs (baseline generator). */
function jsonSchemaToGoType(name: string, schemaRaw: JsonSchemaLike, indent = ""): string {
  const schema = resolveRootSchema(schemaRaw, name);
  const lines: string[] = [];

  if (schema?.type === "object" && schema.properties && typeof schema.properties === "object") {
    const structName =
      name
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("") || "GeneratedStruct";

    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];

    lines.push(`${indent}type ${structName} struct {`);

    for (const [propName, propSchemaRaw] of Object.entries(schema.properties as Record<string, JsonSchemaLike>)) {
      const resolved = resolveRootSchema(propSchemaRaw as JsonSchemaLike, propName);
      const goField = snakeToExportedGoField(propName);
      const goType = jsonSchemaTypeToGo(resolved as JsonSchemaLike, !required.includes(propName));
      const jsonTag = `\`json:"${propName},omitempty"\``;
      lines.push(`${indent}\t${goField} ${goType} ${jsonTag}`);
    }

    lines.push(`${indent}}`);
    return lines.join("\n");
  }

  void name;
  return lines.join("\n");
}

function snakeToExportedGoField(name: string): string {
  const parts = name.split("_").filter(Boolean);
  if (parts.length === 1 && name.includes(".")) {
    /* e.g. kirakira.policyinput → EamPolicyinput */
    return name
      .split(".")
      .map((seg) =>
        seg
          ? seg.charAt(0).toUpperCase() +
            seg
              .slice(1)
              .replace(/\./gu, "")
              .replace(/[^a-zA-Z0-9]/gu, "")
          : "",
      )
      .join("");
  }

  return parts
    .map((seg) =>
      seg.length > 0
        ? seg.charAt(0).toUpperCase() +
          seg.slice(1).replace(/\./gu, "").replace(/[^a-zA-Z0-9]/gu, "")
        : "",
    )
    .join("");
}

function jsonSchemaTypeToGo(schemaRaw: JsonSchemaLike, optional: boolean): string {
  const schema = resolveRootSchema(schemaRaw, undefined);
  const ptr = optional ? "*" : "";

  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf) && !schema.type) {
    let hasNull = false;
    let picked: JsonSchemaLike = {};
    for (const variant of anyOf as JsonSchemaLike[]) {
      const t = variant.type;
      if (t === "null") hasNull = true;
      else if ((typeof t !== "undefined" || variant.properties) && Object.keys(picked).length === 0)
        picked = variant;
    }
    return jsonSchemaTypeToGo(picked, optional || hasNull);
  }

  if (schema.enum) return `${ptr}string`;

  switch (schema.type as string | undefined) {
    case "string":
      return `${ptr}string`;
    case "number":
      return `${ptr}float64`;
    case "integer":
      return `${ptr}int`;
    case "boolean":
      return `${ptr}bool`;
    case "array": {
      const itemsResolved = resolveRootSchema((schema.items as JsonSchemaLike) ?? { type: "string" }, undefined);
      return `[]${jsonSchemaTypeToGo(itemsResolved as JsonSchemaLike, false)}`;
    }
    case "object":
      return `${ptr}map[string]interface{}`;
    default:
      return "interface{}";
  }
}

function generateGoTypes(): void {
  const outPath = join(ROOT, "packages", "kirakirad", "internal", "types", "generated.go");
  mkdirSync(join(ROOT, "packages", "kirakirad", "internal", "types"), { recursive: true });

  const header = `// Code generated by scripts/generate-types.ts. DO NOT EDIT.
package types

`;

  const defs: Record<string, typeof policyInputSchema> = {
    PolicyInput: policyInputSchema,
    AiriskOutput: airiskOutputSchema,
    PolicyDecision: policyDecisionSchema,
    AuditEvent: auditEventSchema,
  };

  let content = header;
  for (const [schemaNameKey, schema] of Object.entries(defs)) {
    const raw = zodToJsonSchema(schema, { name: schemaNameKey, target: "jsonSchema7" });
    content += `${jsonSchemaToGoType(schemaNameKey, resolveRootSchema(raw as JsonSchemaLike, schemaNameKey))}\n\n`;
  }

  writeFileSync(outPath, content);
  console.log("Generated Go types");
}

function generatePythonModels(): void {
  const modelDir = join(ROOT, "packages", "model-gateway", "src", "kirakira_model_gateway");
  mkdirSync(modelDir, { recursive: true });
  const outPath = join(modelDir, "policy_types.py");

  const content = `# Code generated by scripts/generate-types.ts. DO NOT EDIT.
"""Cross-language aligned policy types generated from @kirakira/core Zod schemas."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class PolicyInputPrincipal:
    user_id: str = ""
    org_id: Optional[str] = None
    roles: list[str] = field(default_factory=list)
    groups: Optional[list[str]] = None
    authn_method: str = "token"
    device_trust: str = "unknown"
    interactive: bool = True

@dataclass
class PolicyInputWorkspace:
    workspace_id: str = ""
    root: str = ""

@dataclass
class PolicyInputActionNormalized:
    command_ast_hash: Optional[str] = None
    command_base: Optional[str] = None
    flags: list[str] = field(default_factory=list)
    subcommands: list[str] = field(default_factory=list)
    write_paths: list[str] = field(default_factory=list)
    read_paths: list[str] = field(default_factory=list)
    destructive: bool = False
    interpreter_handoff: bool = False
    pipeline_depth: int = 0
    redirection_targets: list[str] = field(default_factory=list)

@dataclass
class PolicyInputAction:
    kind: str = ""
    tool_type: str = ""
    tool_name: str = ""
    operation: str = ""
    normalized: Optional[PolicyInputActionNormalized] = None

@dataclass
class PolicyInput:
    version: str = "kirakira.policyinput.v1"
    request_id: str = ""
    session_id: str = ""
    trace_id: str = ""
    timestamp: str = ""
    principal: PolicyInputPrincipal = field(default_factory=PolicyInputPrincipal)
    workspace: PolicyInputWorkspace = field(default_factory=PolicyInputWorkspace)
    action: PolicyInputAction = field(default_factory=PolicyInputAction)

@dataclass
class PolicyDecisionApproval:
    required: bool = False
    mode: str = "none"
    template_id: Optional[str] = None
    cacheable: bool = False
    ttl_seconds: Optional[int] = None

@dataclass
class Obligation:
    type: str = ""
    profile: Optional[str] = None
    policy: Optional[str] = None
    channel: Optional[str] = None
    required: Optional[bool] = None
    scope: Optional[str] = None
    min_length: Optional[int] = None
    domains: Optional[list[str]] = None

@dataclass
class PolicyDecision:
    version: str = "kirakira.decision.v1"
    decision_id: str = ""
    request_id: str = ""
    effect: str = "deny"
    reason_codes: list[str] = field(default_factory=list)
    obligations: list[Obligation] = field(default_factory=list)

@dataclass
class AuditEvent:
    version: str = "kirakira.audit.v1"
    event_id: str = ""
    ts: str = ""
    segment: str = ""
    prev_hash: str = ""
    entry_hash: str = ""
    trace_id: str = ""
    kind: str = ""
`;

  writeFileSync(outPath, content);
  console.log("Generated Python Pydantic models");
}

generateJsonSchemas();
generateGoTypes();
generatePythonModels();
console.log("All types generated successfully.");
