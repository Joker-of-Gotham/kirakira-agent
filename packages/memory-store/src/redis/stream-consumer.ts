import type { RedisClient } from "./client.js";

export interface ConsumedMessage {
  id: string;
  data: Record<string, string>;
}

export interface ConsumerConfig {
  stream: string;
  group: string;
  consumer: string;
  batchSize?: number;
  blockMs?: number;
}

/**
 * Consumes messages from Redis streams using XREADGROUP + XACK.
 * Design doc: consumer groups for materialize / forget / reflect workers.
 */
export class StreamConsumer {
  private readonly redis: RedisClient;
  private readonly stream: string;
  private readonly group: string;
  private readonly consumer: string;
  private readonly batchSize: number;
  private readonly blockMs: number;
  private initialized = false;

  constructor(redis: RedisClient, config: ConsumerConfig) {
    this.redis = redis;
    this.stream = config.stream;
    this.group = config.group;
    this.consumer = config.consumer;
    this.batchSize = config.batchSize ?? 10;
    this.blockMs = config.blockMs ?? 2000;
  }

  async ensureGroup(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.redis.xgroup("CREATE", this.stream, this.group, "0", "MKSTREAM");
    } catch {
      // BUSYGROUP — group already exists
    }
    this.initialized = true;
  }

  async read(): Promise<ConsumedMessage[]> {
    await this.ensureGroup();
    const resRaw: unknown = await this.redis.xreadgroup(
      "GROUP", this.group, this.consumer,
      "COUNT", String(this.batchSize),
      "BLOCK", String(this.blockMs),
      "STREAMS", this.stream, ">",
    );

    return this.parseReadResult(resRaw);
  }

  async readPending(): Promise<ConsumedMessage[]> {
    await this.ensureGroup();
    const resRaw: unknown = await this.redis.xreadgroup(
      "GROUP", this.group, this.consumer,
      "COUNT", String(this.batchSize),
      "STREAMS", this.stream, "0",
    );
    return this.parseReadResult(resRaw);
  }

  async ack(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.redis.xack(this.stream, this.group, ...ids);
  }

  private parseReadResult(resRaw: unknown): ConsumedMessage[] {
    if (!Array.isArray(resRaw) || resRaw.length === 0) return [];
    const streamBatch = resRaw[0] as unknown;
    if (!Array.isArray(streamBatch) || streamBatch.length < 2) return [];
    const messages = streamBatch[1] as unknown;
    if (!Array.isArray(messages)) return [];

    const out: ConsumedMessage[] = [];
    for (const msg of messages) {
      if (!Array.isArray(msg) || msg.length < 2) continue;
      const id = msg[0];
      const fields = msg[1];
      if (typeof id !== "string" || !Array.isArray(fields)) continue;
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        const k = fields[i];
        const v = fields[i + 1];
        if (typeof k === "string" && typeof v === "string") data[k] = v;
      }
      out.push({ id, data });
    }
    return out;
  }
}
