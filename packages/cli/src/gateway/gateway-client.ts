/**
 * TS gateway client — communicates with the Python model-gateway
 * via JSON-RPC 2.0 over stdio.
 *
 * Replaces direct HTTP calls in openai-complete.ts with a typed
 * RPC interface that supports all gateway methods.
 */

import { GatewayProcess, type GatewayProcessOptions } from "./gateway-process.js";

export interface CompleteRequest {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string | null;
  model: string;
  rawError?: string | null;
}

export interface ResolvedModel {
  original: string;
  resolved: string;
  capability: Record<string, unknown> | null;
}

export interface HealthResult {
  ok: boolean;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export interface ModelEntry {
  id: string;
  ownedBy?: string | null;
}

export interface CostSummary {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  request_count: number;
  budget_usd: number | null;
  over_budget: boolean;
}

let rpcId = 0;

function makeRpcRequest(method: string, params?: Record<string, unknown>): string {
  rpcId += 1;
  const msg = {
    jsonrpc: "2.0" as const,
    id: rpcId,
    method,
    params: params ?? {},
  };
  return JSON.stringify(msg);
}

function parseRpcResponse<T>(raw: string): T {
  const lines = raw.split("\n").filter((l) => l.trim());
  const last = lines[lines.length - 1];
  if (!last) throw new Error("Empty response from gateway");

  const msg = JSON.parse(last);
  if (msg.error) {
    const e = msg.error;
    throw new Error(`Gateway RPC error ${e.code}: ${e.message}`);
  }
  return msg.result as T;
}

export class GatewayClient {
  private process: GatewayProcess;
  private _started = false;

  constructor(options?: GatewayProcessOptions) {
    this.process = new GatewayProcess(options);
  }

  get isRunning(): boolean {
    return this._started && this.process.state === "running";
  }

  async startGateway(): Promise<void> {
    await this.process.start();
    this._started = true;
  }

  async stopGateway(): Promise<void> {
    await this.process.stop();
    this._started = false;
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    this.ensureRunning();
    const line = makeRpcRequest("complete", {
      prompt: req.prompt,
      model: req.model,
      system_prompt: req.systemPrompt,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 4096,
    });
    const raw = await this.process.sendLine(line);
    return parseRpcResponse<CompleteResult>(raw);
  }

  async resolveModel(name: string): Promise<ResolvedModel> {
    this.ensureRunning();
    const line = makeRpcRequest("resolve_model", { model: name });
    const raw = await this.process.sendLine(line);
    return parseRpcResponse<ResolvedModel>(raw);
  }

  async health(): Promise<HealthResult> {
    this.ensureRunning();
    const line = makeRpcRequest("health");
    const raw = await this.process.sendLine(line);
    return parseRpcResponse<HealthResult>(raw);
  }

  async listModels(): Promise<ModelEntry[]> {
    this.ensureRunning();
    const line = makeRpcRequest("list_models");
    const raw = await this.process.sendLine(line);
    return parseRpcResponse<ModelEntry[]>(raw);
  }

  async costSummary(): Promise<CostSummary> {
    this.ensureRunning();
    const line = makeRpcRequest("cost_summary");
    const raw = await this.process.sendLine(line);
    return parseRpcResponse<CostSummary>(raw);
  }

  async listCapabilities(): Promise<Record<string, Record<string, unknown>>> {
    this.ensureRunning();
    const line = makeRpcRequest("list_capabilities");
    const raw = await this.process.sendLine(line);
    return parseRpcResponse<Record<string, Record<string, unknown>>>(raw);
  }

  async switchProvider(provider: string, baseUrl?: string): Promise<{ previous_provider: string; current_provider: string }> {
    this.ensureRunning();
    const params: Record<string, unknown> = { provider };
    if (baseUrl) params.base_url = baseUrl;
    const line = makeRpcRequest("switch_provider", params);
    const raw = await this.process.sendLine(line);
    return parseRpcResponse<{ previous_provider: string; current_provider: string }>(raw);
  }

  private ensureRunning(): void {
    if (!this._started || this.process.state !== "running") {
      throw new Error(
        "Gateway not running. Call startGateway() first.",
      );
    }
  }
}
