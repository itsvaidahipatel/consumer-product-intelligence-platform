import type { Env } from "../env.js";
import { withTimeout } from "../lib/with-timeout.js";

const EMBED_TIMEOUT_MS = 12_000;

const cache = new Map<string, number[]>();

/** Lightweight hash embedding for deploy without native ML deps (384-dim). */
function hashEmbed(text: string, dims = 384): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    vec[h % dims] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function createEmbeddingService(env: Env) {
  const provider = env.EMBEDDING_PROVIDER ?? "hash";
  const dims = Number(env.EMBEDDING_DIMS ?? 384);

  return {
    async embed(text: string): Promise<{ vector: number[]; model: string }> {
      const key = `${provider}:${text}`;
      const hit = cache.get(key);
      if (hit) return { vector: hit, model: provider };

      if (provider === "ollama" && env.OLLAMA_BASE_URL) {
        const base = env.OLLAMA_BASE_URL.replace(/\/$/, "");
        const model = env.EMBEDDING_MODEL ?? "nomic-embed-text";
        const res = await withTimeout(
          fetch(`${base}/api/embeddings`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model, prompt: text }),
          }),
          EMBED_TIMEOUT_MS,
          "ollama_embeddings",
        ).catch(() => null);
        if (res?.ok) {
          const data = (await res.json()) as { embedding?: number[] };
          const vector = data.embedding ?? hashEmbed(text, dims);
          cache.set(key, vector);
          return { vector, model };
        }
      }

      const vector = hashEmbed(text, dims);
      cache.set(key, vector);
      return { vector, model: "hash-embed-v1" };
    },
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
