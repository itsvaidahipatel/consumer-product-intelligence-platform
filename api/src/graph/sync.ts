import type { Db } from "../db/client.js";
import { canonicalIngredients } from "../db/schema.js";
import { getNeo4jDriver } from "./neo4j.js";
import type { Env } from "../env.js";

export async function syncPostgresToNeo4j(db: Db, env: Env): Promise<number> {
  const driver = getNeo4jDriver(env);
  if (!driver) return 0;

  const session = driver.session();
  const rows = await db.select().from(canonicalIngredients);
  try {
    for (const ing of rows) {
      await session.run(
        `MERGE (i:Ingredient {normalizedName: $normalizedName})
         SET i.displayName = $displayName, i.tier = $tier`,
        {
          normalizedName: ing.normalizedName,
          displayName: ing.displayName,
          tier: ing.tier,
        },
      );
      if (ing.tier === "RED" || ing.tier === "BLACK") {
        await session.run(
          `MATCH (i:Ingredient {normalizedName: $normalizedName})
           MERGE (r:Risk {label: $riskLabel})
           MERGE (i)-[:ASSOCIATED_WITH]->(r)`,
          { normalizedName: ing.normalizedName, riskLabel: `${ing.tier} tier concern` },
        );
      }
    }
    return rows.length;
  } finally {
    await session.close();
  }
}
