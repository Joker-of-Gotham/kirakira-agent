import type { Session } from "neo4j-driver";
import { NODE_CONSTRAINTS, NODE_INDEXES } from "../graph-schema.js";
import { btreeIndexName, constraintName, fulltextIndexName } from "./schema-names.js";

export class Neo4jSchemaManager {
  constructor(private readonly sessionFactory: () => Session) {}

  async ensureSchema(): Promise<void> {
    const session = this.sessionFactory();
    try {
      for (const c of NODE_CONSTRAINTS) {
        const name = constraintName(c.label, c.property);
        const q = `
          CREATE CONSTRAINT ${name} IF NOT EXISTS
          FOR (n:${c.label})
          REQUIRE n.${c.property} IS UNIQUE
        `;
        await session.run(q);
      }

      for (const idx of NODE_INDEXES) {
        if (idx.type === "BTREE") {
          const name = btreeIndexName(idx.label, idx.property);
          const q = `
            CREATE RANGE INDEX ${name} IF NOT EXISTS
            FOR (n:${idx.label})
            ON (n.${idx.property})
          `;
          await session.run(q);
        } else if (idx.type === "TEXT") {
          const name = fulltextIndexName(idx.label, idx.property);
          const q = `
            CREATE FULLTEXT INDEX ${name} IF NOT EXISTS
            FOR (n:${idx.label})
            ON EACH [n.${idx.property}]
          `;
          await session.run(q);
        }
      }
    } finally {
      await session.close();
    }
  }

  async dropSchema(): Promise<void> {
    const session = this.sessionFactory();
    try {
      for (const idx of NODE_INDEXES) {
        const name = idx.type === "BTREE" ? btreeIndexName(idx.label, idx.property) : fulltextIndexName(idx.label, idx.property);
        await session.run(`DROP INDEX ${name} IF EXISTS`);
      }

      for (const c of NODE_CONSTRAINTS) {
        const name = constraintName(c.label, c.property);
        await session.run(`DROP CONSTRAINT ${name} IF EXISTS`);
      }
    } finally {
      await session.close();
    }
  }
}
