import neo4j, { type Driver } from "neo4j-driver";
import type { Env } from "../env.js";

let driver: Driver | null = null;

export function getNeo4jDriver(env: Env): Driver | null {
  if (!env.NEO4J_URI || !env.NEO4J_USER || !env.NEO4J_PASSWORD) return null;
  if (!driver) {
    driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD));
  }
  return driver;
}

export async function runReadOnlyCypher(
  env: Env,
  query: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const d = getNeo4jDriver(env);
  if (!d) return [];
  const session = d.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(query, params);
    return result.records.map((r) => r.toObject() as Record<string, unknown>);
  } finally {
    await session.close();
  }
}

export async function queryIngredientRisks(
  env: Env,
  normalizedName: string,
): Promise<string[]> {
  const rows = await runReadOnlyCypher(
    env,
    `MATCH (i:Ingredient {normalizedName: $name})-[:ASSOCIATED_WITH]->(r:Risk)
     RETURN r.label AS label LIMIT 5`,
    { name: normalizedName },
  );
  return rows.map((r) => String(r.label ?? "")).filter(Boolean);
}
