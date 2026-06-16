import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  canonicalIngredients,
  ingredientRegulatoryStatus,
  ingredientSynonyms,
  productAnalyses,
} from "../db/schema.js";
import type { IngredientTier } from "@ingredient-scanner/shared";

export type MatchedIngredient = {
  rawToken: string;
  normalizedName: string;
  displayName: string;
  tier: IngredientTier;
  description?: string;
  function?: string;
  canonicalId: string | null;
  regulatory: Record<string, "allowed" | "restricted" | "banned">;
};

const UNKNOWN_TIER: IngredientTier = "BLUE";

type CanonicalRow = typeof canonicalIngredients.$inferSelect;

export type IngredientMatchPhaseTracker = (
  phase: string,
  durationMs: number,
  extra?: Record<string, unknown>,
) => void;

/**
 * Match many tokens with a small number of DB round-trips (was: up to 3 queries per token).
 */
export async function matchIngredientTokens(
  db: Db,
  tokens: string[],
  trackPhase?: IngredientMatchPhaseTracker,
): Promise<MatchedIngredient[]> {
  if (tokens.length === 0) return [];

  const normalizedTokens = tokens.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const uniqueNorms = [...new Set(normalizedTokens)];

  const canonicalByNorm = new Map<string, CanonicalRow>();
  if (uniqueNorms.length > 0) {
    const t0 = performance.now();
    const directRows = await db
      .select()
      .from(canonicalIngredients)
      .where(inArray(canonicalIngredients.normalizedName, uniqueNorms));
    trackPhase?.("ingredient_match_direct", performance.now() - t0, {
      unique_token_count: uniqueNorms.length,
      canonical_rows: directRows.length,
    });
    for (const row of directRows) {
      canonicalByNorm.set(row.normalizedName, row);
    }
  }

  const needSynonym = uniqueNorms.filter((n) => !canonicalByNorm.has(n));
  const synonymCanonByNorm = new Map<string, CanonicalRow>();
  if (needSynonym.length > 0) {
    const t1 = performance.now();
    const synRows = await db
      .select({ ci: canonicalIngredients, syn: ingredientSynonyms })
      .from(ingredientSynonyms)
      .innerJoin(
        canonicalIngredients,
        eq(ingredientSynonyms.ingredientId, canonicalIngredients.id),
      )
      .where(inArray(sql`lower(${ingredientSynonyms.synonym})`, needSynonym));

    trackPhase?.("ingredient_match_synonym", performance.now() - t1, {
      need_synonym_count: needSynonym.length,
      synonym_join_rows: synRows.length,
    });

    for (const { ci, syn } of synRows) {
      const key = syn.synonym.trim().toLowerCase();
      if (!synonymCanonByNorm.has(key)) {
        synonymCanonByNorm.set(key, ci);
      }
    }
  }

  const resolvedIds = new Set<string>();
  for (const n of uniqueNorms) {
    const row = canonicalByNorm.get(n) ?? synonymCanonByNorm.get(n);
    if (row) resolvedIds.add(row.id);
  }

  const regulatoryByIngredientId = new Map<string, Record<string, "allowed" | "restricted" | "banned">>();
  if (resolvedIds.size > 0) {
    const ids = [...resolvedIds];
    const t2 = performance.now();
    const regs = await db
      .select()
      .from(ingredientRegulatoryStatus)
      .where(inArray(ingredientRegulatoryStatus.ingredientId, ids));

    trackPhase?.("ingredient_match_regulatory", performance.now() - t2, {
      resolved_canonical_count: ids.length,
      regulatory_rows: regs.length,
    });

    for (const r of regs) {
      const id = r.ingredientId;
      let map = regulatoryByIngredientId.get(id);
      if (!map) {
        map = {};
        regulatoryByIngredientId.set(id, map);
      }
      map[r.countryCode.toLowerCase()] = r.status;
    }
  }

  const results: MatchedIngredient[] = [];
  for (const rawToken of tokens) {
    const normalized = rawToken.trim().toLowerCase();
    if (!normalized) continue;

    const row = canonicalByNorm.get(normalized) ?? synonymCanonByNorm.get(normalized);
    if (!row) {
      results.push({
        rawToken,
        normalizedName: normalized,
        displayName: rawToken,
        tier: UNKNOWN_TIER,
        description: "Not present in the encyclopedia yet; treat cautiously.",
        function: undefined,
        canonicalId: null,
        regulatory: {},
      });
      continue;
    }

    results.push({
      rawToken,
      normalizedName: row.normalizedName,
      displayName: row.displayName,
      tier: row.tier,
      description: row.description ?? undefined,
      function: row.functionDescription ?? undefined,
      canonicalId: row.id,
      regulatory: { ...regulatoryByIngredientId.get(row.id) },
    });
  }

  return results;
}

export async function findLatestCacheableAnalysis(
  db: Db,
  args: {
    siteId: string;
    retailerProductId: string;
    urlHash: string;
    pipelineVersion: string;
    schemaVersion: string;
    maxAgeDays: number;
    minConfidence: number;
  },
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - args.maxAgeDays);

  const rows = await db
    .select()
    .from(productAnalyses)
    .where(
      and(
        eq(productAnalyses.siteId, args.siteId),
        eq(productAnalyses.retailerProductId, args.retailerProductId),
        eq(productAnalyses.urlHash, args.urlHash),
        eq(productAnalyses.pipelineVersion, args.pipelineVersion),
        eq(productAnalyses.schemaVersion, args.schemaVersion),
        eq(productAnalyses.completenessFlag, true),
        gte(productAnalyses.analyzedAt, cutoff),
        or(
          sql`${productAnalyses.provenance} <> 'dom'`,
          sql`coalesce(${productAnalyses.confidenceScore}, 0) >= ${args.minConfidence}`,
        ),
      ),
    )
    .orderBy(desc(productAnalyses.analyzedAt))
    .limit(1);

  return rows[0];
}
