import {
  makeRuntimeProtocolError,
  parseRuntimeClientMessage,
  parseRuntimeServerMessage,
  stringifyRuntimeServerMessage,
  type RuntimeClientMessage,
  type RuntimeClientMessageParseResult,
  type RuntimeServerMessage,
} from "@kirakira/runtime-contracts";

export type ClientMessage = RuntimeClientMessage;
export type ServerMessage = RuntimeServerMessage;

export { makeRuntimeProtocolError };

export function validateClientMessage(raw: unknown): RuntimeClientMessageParseResult {
  return parseRuntimeClientMessage(raw);
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const result = parseRuntimeClientMessage(raw);
  return result.ok ? result.message : null;
}

export function safeJsonStringify(msg: ServerMessage): string {
  return stringifyRuntimeServerMessage(msg);
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const data: unknown = JSON.parse(raw);
    return parseRuntimeServerMessage(data);
  } catch {
    return null;
  }
}
