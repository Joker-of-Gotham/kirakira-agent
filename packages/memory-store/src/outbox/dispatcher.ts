import { RedisKeySchema } from "../redis/key-schema.js";

export type StreamRouter = (eventType: string) => string | undefined;

const DEFAULT_EVENT_STREAMS: Record<string, string> = {
  "memory.retained": RedisKeySchema.streamMaterialize,
  "memory.forget": RedisKeySchema.streamForget,
};

/**
 * Routes outbox `event_type` values to Redis stream keys.
 */
export function createDefaultDispatcher(extraRoutes: Record<string, string> = {}): StreamRouter {
  const routes = { ...DEFAULT_EVENT_STREAMS, ...extraRoutes };
  return (eventType: string) => routes[eventType];
}

export function resolveStreamOrThrow(router: StreamRouter, eventType: string): string {
  const stream = router(eventType);
  if (!stream) {
    throw new Error(`no Redis stream mapping for event type: ${eventType}`);
  }
  return stream;
}
