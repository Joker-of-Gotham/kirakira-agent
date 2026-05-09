/** Standard payload index field names and Qdrant payload schema types */
export const MEMORY_PAYLOAD_INDEXES: readonly {
  readonly field_name: string;
  readonly field_schema:
    | "keyword"
    | "integer"
    | "float"
    | "geo"
    | "text"
    | "bool"
    | "datetime"
    | "uuid";
}[] = [
  { field_name: "tenant_id", field_schema: "keyword" },
  { field_name: "namespace", field_schema: "keyword" },
  { field_name: "kind", field_schema: "keyword" },
  { field_name: "entity_ids", field_schema: "keyword" },
  { field_name: "valid_from", field_schema: "datetime" },
  { field_name: "valid_to", field_schema: "datetime" },
  { field_name: "pii_level", field_schema: "integer" },
  { field_name: "tombstoned", field_schema: "bool" },
] as const;
