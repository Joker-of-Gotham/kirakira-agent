export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePattern(pattern: string): Promise<number>;

  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<boolean>;
  extendLock(key: string, token: string, ttlMs: number): Promise<boolean>;

  publishToStream(stream: string, data: Record<string, string>): Promise<string>;
  consumeStream(stream: string, group: string, consumer: string, count: number): Promise<Array<{ id: string; data: Record<string, string> }>>;
  ackStream(stream: string, group: string, ids: string[]): Promise<void>;
  createConsumerGroup(stream: string, group: string): Promise<void>;

  close(): Promise<void>;
}
