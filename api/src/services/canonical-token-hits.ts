import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { canonicalIngredients, ingredientSynonyms } from "../db/schema.js";

/**
 * Returns normalized token names that appear in the encyclopedia (direct or synonym).
 */
export async function resolveCanonicalTokenHits(db: Db, normalizedTokens: string[]): Promise<Set<string>> {
  const hits = new Set<string>();
  const unique = [...new Set(normalizedTokens.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return hits;

  const direct = await db
    .select({ n: canonicalIngredients.normalizedName })
    .from(canonicalIngredients)
    .where(inArray(canonicalIngredients.normalizedName, unique));

  for (const row of direct) hits.add(row.n);

  const need = unique.filter((u) => !hits.has(u));
  if (need.length === 0) return hits;

  const synRows = await db
    .select({ syn: ingredientSynonyms.synonym, n: canonicalIngredients.normalizedName })
    .from(ingredientSynonyms)
    .innerJoin(canonicalIngredients, eq(ingredientSynonyms.ingredientId, canonicalIngredients.id))
    .where(inArray(sql`lower(${ingredientSynonyms.synonym})`, need));

  for (const row of synRows) {
    const key = row.syn.trim().toLowerCase();
    if (need.includes(key)) hits.add(key);
  }

  return hits;
}
