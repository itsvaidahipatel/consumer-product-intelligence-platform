import type { FastifyInstance } from "fastify";
import { ensureApiKeyAuthorized, parseApiKeys } from "../lib/api-key-guard.js";
import type { Env } from "../env.js";

export async function registerFeedbackRoutes(
  app: FastifyInstance,
  deps: { env: Env },
): Promise<void> {
  const keys = parseApiKeys(deps.env.INGREDIENT_SCANNER_API_KEYS);
  // POST /feedback is registered in analysis.ts — this module reserved for future batch export routes.
  void keys;
  app.get("/feedback/health", async (req, reply) => {
    if (!ensureApiKeyAuthorized(req, reply, keys)) return;
    return reply.send({ ok: true });
  });
}
