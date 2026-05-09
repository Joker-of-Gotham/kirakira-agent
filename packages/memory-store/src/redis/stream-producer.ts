import type { RedisClient } from "./client.js";

export interface StreamMessage {
  [field: string]: string;
}

/**
 * Publishes events to Redis streams with XADD.
 * Design doc: streams 作为 embedding、graph upsert、blob post-process、forget materializer 的异步队列。
 */
export class StreamProducer {
  constructor(private readonly redis: RedisClient) {}

  async publish(stream: string, data: StreamMessage): Promise<string> {
    const flat = Object.entries(data).flat() as [string, string, ...string[]];
    const id = await this.redis.xadd(stream, "*", ...flat);
    if (id == null) throw new Error(`XADD to ${stream} returned null`);
    return id;
  }

  async publishBatch(stream: string, messages: StreamMessage[]): Promise<string[]> {
    const pipeline = this.redis.pipeline();
    for (const data of messages) {
      const flat = Object.entries(data).flat();
      pipeline.xadd(stream, "*", ...flat);
    }
    const results = await pipeline.exec();
    if (!results) return [];
    return results.map(([, id]) => (typeof id === "string" ? id : ""));
  }

  async trimStream(stream: string, maxLen: number, approximate = true): Promise<number> {
    const args: string[] = [stream, "MAXLEN"];
    if (approximate) args.push("~");
    args.push(String(maxLen));
    const trimmed = await (this.redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call("xtrim", ...args);
    return typeof trimmed === "number" ? trimmed : 0;
  }

  async streamLength(stream: string): Promise<number> {
    return await this.redis.xlen(stream);
  }
}
