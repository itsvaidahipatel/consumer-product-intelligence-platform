import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Db } from "../../db/client.js";
import { canonicalIngredients, ingredientEvidence, ingredientNotes } from "../../db/schema.js";
import { createEmbeddingService } from "../../llm/embeddings.js";
import type { Env } from "../../env.js";

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function seedDocumentChunksFromEncyclopedia(db: Db, env: Env): Promise<number> {
  const embedder = createEmbeddingService(env);
  const ingredients = await db.select().from(canonicalIngredients);
  let inserted = 0;

  for (const ing of ingredients) {
    const body = [ing.displayName, ing.description, ing.functionDescription].filter(Boolean).join(" — ");
    if (!body) continue;
    const hash = contentHash(body);
    const { vector, model } = await embedder.embed(body);
    const vecLiteral = `[${vector.join(",")}]`;
    try {
      await db.execute(sql`
        INSERT INTO document_chunks (ingredient_id, source_type, title, excerpt, source_uri, trust_weight, embedding, embedding_model, content_hash)
        VALUES (${ing.id}, 'encyclopedia', ${ing.displayName}, ${body}, ${"internal://canonical/" + ing.normalizedName}, 0.9, ${vecLiteral}::vector, ${model}, ${hash})
        ON CONFLICT (content_hash) DO NOTHING
      `);
      inserted += 1;
    } catch {
      /* pgvector may be unavailable */
    }
  }

  const evidence = await db.select().from(ingredientEvidence).limit(500);
  for (const ev of evidence) {
    const excerpt = ev.excerpt ?? ev.title ?? "";
    if (!excerpt) continue;
    const hash = contentHash(excerpt);
    const { vector, model } = await embedder.embed(excerpt);
    const vecLiteral = `[${vector.join(",")}]`;
    try {
      await db.execute(sql`
        INSERT INTO document_chunks (ingredient_id, source_type, title, excerpt, source_uri, trust_weight, embedding, embedding_model, content_hash)
        VALUES (${ev.ingredientId}, ${ev.sourceType}, ${ev.title}, ${excerpt}, ${ev.url}, 0.85, ${vecLiteral}::vector, ${model}, ${hash})
        ON CONFLICT (content_hash) DO NOTHING
      `);
      inserted += 1;
    } catch {
      /* ignore */
    }
  }

  const notes = await db.select().from(ingredientNotes).limit(200);
  for (const note of notes) {
    const hash = contentHash(note.body);
    const { vector, model } = await embedder.embed(note.body);
    const vecLiteral = `[${vector.join(",")}]`;
    try {
      await db.execute(sql`
        INSERT INTO document_chunks (ingredient_id, source_type, title, excerpt, trust_weight, embedding, embedding_model, content_hash)
        VALUES (${note.ingredientId}, 'manual', 'Note', ${note.body}, 0.7, ${vecLiteral}::vector, ${model}, ${hash})
        ON CONFLICT (content_hash) DO NOTHING
      `);
      inserted += 1;
    } catch {
      /* ignore */
    }
  }

  return inserted;
}
