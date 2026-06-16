import { sql } from "drizzle-orm";
import type { EvidenceRef } from "@ingredient-scanner/shared";
import type { Db } from "../db/client.js";
import type { Env } from "../env.js";
import { createEmbeddingService, cosineSimilarity } from "../llm/embeddings.js";

export async function retrieveEvidenceForIngredient(
  db: Db,
  env: Env,
  normalizedName: string,
  topK = 3,
): Promise<EvidenceRef[]> {
  type ChunkRow = {
    id: string;
    excerpt: string;
    title: string | null;
    source_uri: string | null;
    trust_weight: number;
  };

  let rows: ChunkRow[] = [];
  try {
    const result = await db.execute(sql`
      SELECT id, excerpt, title, source_uri, trust_weight
      FROM document_chunks
      WHERE excerpt ILIKE ${`%${normalizedName}%`}
      ORDER BY trust_weight DESC
      LIMIT 50
    `);
    rows = result as unknown as ChunkRow[];
  } catch {
    return [];
  }

  const scored = rows.map((row) => {
    const textScore = row.excerpt.toLowerCase().includes(normalizedName) ? 0.7 : 0.3;
    const trustBoost = row.trust_weight ?? 0.5;
    const score = textScore * trustBoost;
    return { row, score };
  });

  if (scored.length < topK) {
    try {
      const embedder = createEmbeddingService(env);
      const { vector: queryVec } = await embedder.embed(normalizedName);
      const semantic = await db.execute(sql`
        SELECT id, excerpt, title, source_uri, trust_weight, embedding::text AS embedding_text
        FROM document_chunks
        WHERE embedding IS NOT NULL
        LIMIT 100
      `);
      type SemanticRow = ChunkRow & { embedding_text?: string };
      for (const raw of semantic as unknown as SemanticRow[]) {
        if (!raw.embedding_text) continue;
        const parts = raw.embedding_text
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((v) => Number(v.trim()))
          .filter((n) => !Number.isNaN(n));
        const sim = cosineSimilarity(queryVec, parts);
        const existing = scored.find((s) => s.row.id === raw.id);
        const hybrid = sim * 0.6 + (raw.trust_weight ?? 0.5) * 0.4;
        if (existing) {
          existing.score = Math.max(existing.score, hybrid);
        } else {
          scored.push({ row: raw, score: hybrid });
        }
      }
    } catch {
      /* vector column may be empty */
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ row, score }) => ({
    id: `rag:${row.id}`,
    sourceType: "rag_chunk" as const,
    title: row.title ?? undefined,
    excerpt: row.excerpt,
    url: row.source_uri ?? undefined,
    confidence: Math.min(1, score),
  }));
}
