import type { FastifyReply, FastifyRequest } from "fastify";

export function parseApiKeys(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** When keys are configured, require a matching `x-api-key` header. */
export function ensureApiKeyAuthorized(
  req: FastifyRequest,
  reply: FastifyReply,
  keys: string[],
): boolean {
  if (keys.length === 0) return true;
  const header = req.headers["x-api-key"];
  const provided = typeof header === "string" ? header : Array.isArray(header) ? header[0] : "";
  if (!provided || !keys.includes(provided)) {
    void reply.code(401).send({
      error: "unauthorized",
      hint: "Send x-api-key matching INGREDIENT_SCANNER_API_KEYS (extension Options → API key).",
    });
    return false;
  }
  return true;
}
