/**
 * Spawned by event-writer.test.ts to stress SQLite + JSONL with parallel processes.
 */
import { EventWriter } from "@kirakira/event-store";

const base = process.argv[2];
const runId = process.argv[3];
const slot = Number(process.argv[4]);
if (!base || !runId || Number.isNaN(slot)) {
  process.stderr.write("usage: tsx event-writer-concurrent-helper.ts <base> <runId> <slot>\n");
  process.exit(1);
}

await new Promise<void>((resolve) => setTimeout(resolve, slot * 200));

const w = new EventWriter(base);
for (let i = 0; i < 20; i += 1) {
  w.append({
    id: `${slot}-${i}`,
    runId,
    timestamp: new Date().toISOString(),
    kind: "model.request",
    payload: { slot, i },
  });
}
w.close();
