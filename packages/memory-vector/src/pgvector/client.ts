import postgres from "postgres";

export async function createPgVectorClient(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  return sql;
}

export default postgres;
