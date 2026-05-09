import neo4j from "neo4j-driver";
import type { Node, Path, Relationship } from "neo4j-driver";
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeLabel, GraphPath } from "@kirakira/memory-core";

export function valueFromNeo(value: unknown): unknown {
  if (neo4j.isInt(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(valueFromNeo);
  if (value && typeof value === "object") {
    if (
      value instanceof neo4j.types.DateTime ||
      value instanceof neo4j.types.Date ||
      value instanceof neo4j.types.Time ||
      value instanceof neo4j.types.LocalDateTime ||
      value instanceof neo4j.types.Duration
    ) {
      return value.toString();
    }
    if (neo4j.isPoint(value)) {
      return JSON.stringify(value);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = valueFromNeo(v);
    }
    return out;
  }
  return value;
}

export function propsFromNeo(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = valueFromNeo(v);
  }
  return out;
}

export function nodeIdFromNeoNode(node: Node): string {
  const raw = propsFromNeo(node.properties as Record<string, unknown>) as Record<string, unknown>;
  return String(raw["id"] ?? "");
}

export function neoNodeToGraphNode(node: Node): GraphNode {
  const raw = propsFromNeo(node.properties as Record<string, unknown>) as Record<string, unknown>;
  const label = (node.labels[0] ?? "Entity") as GraphNodeLabel;
  const id = String(raw["id"] ?? "");
  return {
    id,
    label,
    props: raw,
    createdAt: String(raw["created_at"] ?? raw["createdAt"] ?? ""),
  };
}

export function rowToGraphEdge(rel: Relationship, fromNode: Node, toNode: Node): GraphEdge {
  const raw = propsFromNeo(rel.properties as Record<string, unknown>) as Record<string, unknown>;
  const from = nodeIdFromNeoNode(fromNode);
  const to = nodeIdFromNeoNode(toNode);
  return {
    id: String(raw["id"] ?? ""),
    type: rel.type as GraphEdgeType,
    from,
    to,
    validAt: raw["valid_at"] != null ? String(raw["valid_at"]) : raw["validAt"] != null ? String(raw["validAt"]) : undefined,
    invalidAt:
      raw["invalid_at"] != null ? String(raw["invalid_at"]) : raw["invalidAt"] != null ? String(raw["invalidAt"]) : undefined,
    createdAt: String(raw["created_at"] ?? raw["createdAt"] ?? ""),
    expiredAt:
      raw["expired_at"] != null ? String(raw["expired_at"]) : raw["expiredAt"] != null ? String(raw["expiredAt"]) : undefined,
    props: raw,
  };
}

export function neoPathToGraphPath(path: Path): GraphPath {
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  if (path.segments.length === 0) {
    return { nodeIds, edgeIds, totalWeight: 0 };
  }
  const first = path.segments[0];
  if (!first) return { nodeIds, edgeIds, totalWeight: 0 };
  nodeIds.push(nodeIdFromNeoNode(first.start));
  for (const seg of path.segments) {
    const raw = propsFromNeo(seg.relationship.properties as Record<string, unknown>) as Record<string, unknown>;
    edgeIds.push(String(raw["id"] ?? seg.relationship.elementId));
    nodeIds.push(nodeIdFromNeoNode(seg.end));
  }
  return { nodeIds, edgeIds, totalWeight: path.segments.length };
}
