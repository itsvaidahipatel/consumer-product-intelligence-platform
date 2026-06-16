import type { FastifyInstance } from "fastify";
import { AnalyzeProductRequestSchema } from "@ingredient-scanner/shared";
import { randomUUID } from "node:crypto";
import type { Db } from "../db/client.js";
import type { Env } from "../env.js";
import type { VisionClient } from "../services/vision.js";
import { runAnalyzeProductPipeline } from "../services/analyze-pipeline.js";
import { SERVICE_VERSION } from "../version.js";

type AnalysisErrorBody = {
  error: "analysis_failed";
  message: string;
  hint?: string;
  /** Raw driver/system message (no passwords); for debugging truncated UI. */
  details?: string;
};

/** Map infra errors to 503 + stable hints for operators (no secrets). */
function analysisFailureResponse(err: unknown): {
  status: number;
  body: AnalysisErrorBody;
} {
  const raw = err instanceof Error ? err.message : "unknown_error";
  if (/Vision OCR requested/i.test(raw)) {
    return { status: 503, body: { error: "analysis_failed", message: raw } };
  }
  if (/DNS_NO_RECORDS_FOR_HOST/i.test(raw)) {
    return {
      status: 503,
      body: {
        error: "analysis_failed",
        message: "PostgreSQL hostname has no DNS records from this machine.",
        details: raw,
        hint:
          "Confirm DATABASE_URL host matches Supabase Dashboard → Settings → Database. Try dig +short AAAA <host> and dig +short <host>. Use the Transaction pooler URI (port 6543) if direct db (port 5432) fails.",
      },
    };
  }
  if (/ENOTFOUND|getaddrinfo enotfound/i.test(raw)) {
    return {
      status: 503,
      body: {
        error: "analysis_failed",
        message: "PostgreSQL hostname could not be resolved (DNS ENOTFOUND).",
        details: raw,
        hint:
          "If the host is db.<ref>.supabase.co: it may be IPv6-only — use Transaction pooler (pooler.supabase.com:6543) from Settings → Database, or enable Supabase IPv4 add-on. Ensure DATABASE_URL is copied exactly from the dashboard. The API includes a details field with the raw error for debugging.",
      },
    };
  }
  if (
    /CONNECT_TIMEOUT|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|socket hang up/i.test(raw) ||
    (/supabase\.co/i.test(raw) && /connect|timeout|refused/i.test(raw))
  ) {
    return {
      status: 503,
      body: {
        error: "analysis_failed",
        message: "Cannot connect to PostgreSQL (timeout or network refusal).",
        details: raw,
        hint:
          "If you use Supabase: open the dashboard and confirm the project is not paused. Prefer the Transaction pooler connection string (port 6543, URI mode) from Settings → Database → Connection pooling for Railway/serverless. Ensure DATABASE_URL includes sslmode=require. On IPv4-only hosts, try NODE_OPTIONS=--dns-result-order=ipv4first or enable Supabase IPv4 add-on.",
      },
    };
  }
  return { status: 500, body: { error: "analysis_failed", message: raw, details: raw } };
}

function parseApiKeys(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function registerAnalyzeProductRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: Env; vision: VisionClient | null },
): Promise<void> {
  const keys = parseApiKeys(deps.env.INGREDIENT_SCANNER_API_KEYS);

  app.post("/analyze/product", async (req, reply) => {
    if (keys.length > 0) {
      const header = req.headers["x-api-key"];
      const provided = typeof header === "string" ? header : Array.isArray(header) ? header[0] : "";
      if (!provided || !keys.includes(provided)) {
        return reply.code(401).send({ error: "unauthorized" });
      }
    }

    const parsed = AnalyzeProductRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const correlationId = randomUUID();
    const started = Date.now();
    const pipelineLog = req.log.child({
      correlation_id: correlationId,
      route: "POST /analyze/product",
    });

    pipelineLog.info(
      {
        event: "analyze_product_request_accepted",
        site_id: parsed.data.siteId,
        image_url_count: parsed.data.imageUrls.length,
        analysis_mode: parsed.data.analysisMode,
        force_refresh: Boolean(parsed.data.forceRefresh),
        raw_text_chars: parsed.data.rawIngredientText.length,
      },
      "analyze_product_request",
    );

    try {
      const result = await runAnalyzeProductPipeline({
        db: deps.db,
        req: parsed.data,
        vision: deps.vision,
        correlationId,
        log: pipelineLog,
      });

      req.log.info({
        correlation_id: correlationId,
        outcome: result.resultSource === "cache" ? "cache_hit" : "success",
        duration_ms: Date.now() - started,
        total_ingredients: result.totalIngredients,
        result_source: result.resultSource,
        service: deps.env.SERVICE_NAME,
        version: SERVICE_VERSION,
      });

      return reply.send(result);
    } catch (err) {
      req.log.error(
        {
          correlation_id: correlationId,
          outcome: "failure",
          failure_stage: "analyze_product_pipeline",
          duration_ms: Date.now() - started,
          service: deps.env.SERVICE_NAME,
          version: SERVICE_VERSION,
          err,
        },
        "analyze_product_failed",
      );

      const { status, body } = analysisFailureResponse(err);
      return reply.code(status).send(body);
    }
  });
}
