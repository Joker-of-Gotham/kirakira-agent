import type { OutputEvent } from "@kirakira/core";
import { outputEventSchema } from "./event-schema.js";

export function serializeOutputEventJsonl(event: OutputEvent): string {
  const parsed = outputEventSchema.parse(event);
  return `${JSON.stringify(parsed)}\n`;
}

export function serializeOutputEventsJsonl(events: Iterable<OutputEvent>): string {
  let acc = "";
  for (const e of events) {
    acc += serializeOutputEventJsonl(e);
  }
  return acc;
}
