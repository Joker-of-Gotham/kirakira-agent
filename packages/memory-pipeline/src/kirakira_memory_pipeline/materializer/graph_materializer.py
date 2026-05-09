"""Neo4j graph materialization for entities and relations."""

from __future__ import annotations

from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase

from kirakira_memory_pipeline.config import MemoryPipelineConfig


def _clean_label(label: str) -> str:
    cleaned = "".join(ch for ch in label if ch.isalnum() or ch == "_")
    return cleaned or "Entity"


class GraphMaterializer:
    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        self._driver: AsyncDriver | None = None

    async def connect(self) -> None:
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self.config.neo4j_uri,
                auth=(self.config.neo4j_user, self.config.neo4j_password),
            )

    async def close(self) -> None:
        if self._driver is not None:
            await self._driver.close()
            self._driver = None

    async def upsert_batch(self, batch: dict[str, Any]) -> None:
        await self.connect()
        assert self._driver is not None
        entities = batch.get("entities") or []
        relationships = batch.get("relationships") or []
        facts = batch.get("facts") or []

        async with self._driver.session() as session:
            for ent in entities:
                if not isinstance(ent, dict):
                    raise ValueError("entity entries must be objects")
                eid = ent.get("id")
                if not eid:
                    raise ValueError("entity requires id")
                label = _clean_label(str(ent.get("label") or ent.get("type") or "Entity"))
                props = dict(ent.get("props") or {})
                props["id"] = str(eid)
                props["label"] = label
                cypher = f"MERGE (n:`{label}` {{id: $id}}) SET n += $props, n.updated_at = datetime()"
                await session.run(cypher, id=str(eid), props=props)

            for rel in relationships:
                if not isinstance(rel, dict):
                    raise ValueError("relationship entries must be objects")
                frm = rel.get("from")
                to = rel.get("to")
                rtype = str(rel.get("type") or "RELATED_TO")
                rprops = dict(rel.get("props") or {})
                if not frm or not to:
                    raise ValueError("relationship requires from and to")
                rtype_clean = "".join(ch for ch in rtype if ch.isalnum() or ch == "_") or "RELATED_TO"
                await session.run(
                    (
                        "MATCH (a {id: $from_id}) "
                        "MATCH (b {id: $to_id}) "
                        f"MERGE (a)-[r:{rtype_clean}]->(b) "
                        "SET r += $props, r.updated_at = datetime()"
                    ),
                    from_id=str(frm),
                    to_id=str(to),
                    props=rprops,
                )

            for fact in facts:
                if not isinstance(fact, dict):
                    raise ValueError("fact entries must be objects")
                subj = str(fact.get("subject") or "")
                pred = str(fact.get("predicate") or "")
                obj = str(fact.get("object") or "")
                if not (subj and pred and obj):
                    continue
                fid = fact.get("id") or f"{subj}|{pred}|{obj}"
                await session.run(
                    (
                        "MERGE (s:Concept {id: $sid}) SET s.name = $subj "
                        "MERGE (o:Concept {id: $oid}) SET o.name = $obj "
                        "MERGE (s)-[r:FACT {id: $fid}]->(o) "
                        "SET r.predicate = $pred, r.confidence = $conf, r.updated_at = datetime()"
                    ),
                    sid=subj,
                    oid=obj,
                    subj=subj,
                    obj=obj,
                    fid=str(fid),
                    pred=pred,
                    conf=float(fact.get("confidence", 1.0)),
                )

    async def delete_entities(self, spec: dict[str, Any]) -> None:
        if not spec:
            return
        await self.connect()
        assert self._driver is not None
        ids = spec.get("ids")
        async with self._driver.session() as session:
            if isinstance(ids, list) and ids:
                await session.run(
                    "MATCH (n) WHERE n.id IN $ids DETACH DELETE n",
                    ids=[str(i) for i in ids],
                )
            elif match := spec.get("match"):
                await session.run(
                    "MATCH (n {id: $id}) DETACH DELETE n",
                    id=str(match.get("id")),
                )
