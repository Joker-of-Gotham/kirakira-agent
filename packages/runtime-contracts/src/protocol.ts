import type { ControlMessage } from "./control.js";
import type { EventFilter, RunEvent } from "./events.js";
import type { RunStateSnapshot } from "./snapshot.js";

export type RuntimeClientMessage =
  | {
      type: "control";
      message: ControlMessage;
      messageId?: string;
    }
  | {
      type: "subscribe";
      runId?: string;
      filter?: EventFilter;
      afterSeq?: number;
      messageId?: string;
    }
  | {
      type: "unsubscribe";
      subscriptionId: string;
      messageId?: string;
    }
  | {
      type: "get_state";
      runId: string;
      messageId: string;
    }
  | {
      type: "ping";
      messageId?: string;
    };

export type RuntimeServerMessage =
  | { type: "event"; event: RunEvent }
  | { type: "state_snapshot"; state: RunStateSnapshot }
  | { type: "error"; code: string; message: string; details?: unknown; messageId?: string }
  | { type: "ack"; messageId: string; result?: unknown }
  | { type: "pong"; messageId?: string }
  | {
      type: "subscribed";
      subscriptionId: string;
      messageId?: string;
      replayedThroughSeq?: number;
    };
