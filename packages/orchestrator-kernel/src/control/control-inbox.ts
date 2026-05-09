import type { ControlMessage } from "../types.js";

export class ControlInbox {
  private urgent: ControlMessage[] = [];
  private normal: ControlMessage[] = [];

  receive(message: ControlMessage): void {
    if (message.kind === "steer_now") {
      const p = message.payload.priority;
      if (p === "high") this.urgent.unshift(message);
      else this.urgent.push(message);
      return;
    }
    if (message.kind === "cancel_hard" || message.kind === "request_drain") {
      this.urgent.push(message);
      return;
    }
    this.normal.push(message);
  }

  process(): ControlMessage | null {
    return this.urgent.shift() ?? this.normal.shift() ?? null;
  }

  hasPending(): boolean {
    return this.urgent.length > 0 || this.normal.length > 0;
  }
}
