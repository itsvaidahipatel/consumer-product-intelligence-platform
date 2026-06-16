import type { FastifyInstance } from "fastify";
import { AnalysisFeedbackRequestSchema } from "@ingredient-scanner/shared";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import type { Env } from "../env.js";
import { ensureApiKeyAuthorized, parseApiKeys } from "../lib/api-key-guard.js";
import { analysisFeedback, productAnalyses } from "../db/schema.js";
import { buildStoredAnalysisResponse } from "../services/analyze-pipeline.js";
import { SERVICE_VERSION } from "../version.js";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function registerAnalysisRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: Env },
): Promise<void> {
  const keys = parseApiKeys(deps.env.INGREDIENT_SCANNER_API_KEYS);

  app.get("/analysis/:id", async (req, reply) => {
    if (!ensureApiKeyAuthorized(req, reply, keys)) return;

    const id = (req.params as { id?: string }).id?.trim() ?? "";
    if (!uuidRe.test(id)) {
      return reply.code(400).send({ error: "invalid_analysis_id" });
    }

    const correlationId = randomUUID();
    const started = Date.now();
    const pipelineLog = req.log.child({
      correlation_id: correlationId,
      route: "GET /analysis/:id",
      analysis_id: id,
    });

    const metaRows = await deps.db
      .select({ correlationId: productAnalyses.correlationId })
      .from(productAnalyses)
      .where(eq(productAnalyses.id, id))
      .limit(1);

    const storedCorrelationId = metaRows[0]?.correlationId;
    if (!storedCorrelationId) {
      return reply.code(404).send({ error: "analysis_not_found" });
    }

    const logBase: Record<string, unknown> = {
      correlation_id: correlationId,
      analysis_id: id,
    };

    const built = await buildStoredAnalysisResponse(
      deps.db,
      id,
      storedCorrelationId,
      pipelineLog,
      logBase,
      { resultSource: "stored", cacheReason: "analysis_id_fetch" },
    );

    if (!built) {
      return reply.code(404).send({ error: "analysis_not_found" });
    }

    req.log.info({
      correlation_id: correlationId,
      outcome: "stored_fetch",
      duration_ms: Date.now() - started,
      total_ingredients: built.totalIngredients,
      result_source: built.resultSource,
      service: deps.env.SERVICE_NAME,
      version: SERVICE_VERSION,
    });

    return reply.send(built);
  });

  app.post("/feedback", async (req, reply) => {
    if (!ensureApiKeyAuthorized(req, reply, keys)) return;

    const parsed = AnalysisFeedbackRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const { analysisId, vote, labels, comment, clientHints } = parsed.data;

    const exists = await deps.db
      .select({ id: productAnalyses.id })
      .from(productAnalyses)
      .where(eq(productAnalyses.id, analysisId))
      .limit(1);

    if (!exists[0]) {
      return reply.code(404).send({ error: "analysis_not_found" });
    }

    const [row] = await deps.db
      .insert(analysisFeedback)
      .values({
        analysisId,
        vote,
        labels,
        comment: comment ?? null,
        clientHints: clientHints ?? null,
      })
      .returning({ id: analysisFeedback.id });

    if (!row) {
      return reply.code(500).send({ error: "feedback_persist_failed" });
    }

    req.log.info({
      event: "analysis_feedback_created",
      feedback_id: row.id,
      analysis_id: analysisId,
      vote,
      label_count: labels.length,
      service: deps.env.SERVICE_NAME,
      version: SERVICE_VERSION,
    });

    return reply.code(201).send({ ok: true, feedbackId: row.id });
  });
}
