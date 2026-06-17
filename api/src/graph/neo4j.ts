import neo4j, { type Driver } from "neo4j-driver";
import type { Env } from "../env.js";
import { withTimeout } from "../lib/with-timeout.js";

const NEO4J_QUERY_TIMEOUT_MS = 8_000;

let driver: Driver | null = null;

export function getNeo4jDriver(env: Env): Driver | null {
  if (!env.NEO4J_URI || !env.NEO4J_USER || !env.NEO4J_PASSWORD) return null;
  if (!driver) {
    driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD), {
      connectionTimeout: 5_000,
      connectionAcquisitionTimeout: 8_000,
      maxConnectionLifetime: 60_000,
    });
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
    const result = await withTimeout(
      session.run(query, params),
      NEO4J_QUERY_TIMEOUT_MS,
      "neo4j_query",
    );
    return result.records.map((r) => r.toObject() as Record<string, unknown>);
  } catch {
    return [];
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
