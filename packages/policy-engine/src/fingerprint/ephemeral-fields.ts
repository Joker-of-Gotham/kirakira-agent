export const EPHEMERAL_FIELDS: readonly string[] = [
  "request_id",
  "timestamp",
  "nonce",
  "temp_filename",
  "span_id",
  "trace_id",
  "session_id",
  "event_id",
];

export function isEphemeral(field: string): boolean {
  return EPHEMERAL_FIELDS.includes(field);
}
