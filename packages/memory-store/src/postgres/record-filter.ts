export interface MemoryRecordFilter {
  tenantId?: string;
  workspaceId?: string;
  namespace?: string;
  kind?: string;
  ids?: string[];
  /** Filter rows valid at this instant (valid-time). */
  validAt?: Date | string;
  /** Filter rows transactionally visible at this instant (tx-time). */
  txAt?: Date | string;
  includeTombstoned?: boolean;
  limit?: number;
  offset?: number;
  /** When true, orders by created_at descending before limit/offset. Default true. */
  orderByCreatedDesc?: boolean;
}
