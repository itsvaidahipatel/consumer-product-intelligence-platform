import type { Env } from "../env.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmCompletion = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
};

/** Railway has no local Ollama unless explicitly configured with a reachable URL. */
export function isOllamaConfigured(env: Env): boolean {
  const base = (env.OLLAMA_BASE_URL ?? "").trim();
  if (!base) return false;
  if (env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/i.test(base)) {
    return false;
  }
  return true;
}

export function createLlmClient(env: Env) {
  const baseUrl = (env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const timeoutMs = env.OLLAMA_TIMEOUT_MS ?? 10_000;

  return {
    async complete(messages: ChatMessage[], modelId: string): Promise<LlmCompletion> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: modelId,
            messages,
            stream: false,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Ollama chat failed: ${res.status} ${body.slice(0, 200)}`);
        }
        const data = (await res.json()) as {
          message?: { content?: string };
          prompt_eval_count?: number;
          eval_count?: number;
        };
        return {
          text: data.message?.content?.trim() ?? "",
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
          modelId,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function pickModelId(env: Env, ingredientCount: number, needsOcr: boolean): string {
  const fast = env.OLLAMA_MODEL_FAST ?? "llama3.2:3b";
  const reasoning = env.OLLAMA_MODEL_REASONING ?? fast;
  if (ingredientCount >= 20 || needsOcr) return reasoning;
  return fast;
}
