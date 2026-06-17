import type { AnalyzeProductRequest, AnalyzeProductResponse } from "@ingredient-scanner/shared";
import type { Db } from "../db/client.js";
import type { Env } from "../env.js";
import type { VisionClient } from "../services/vision.js";
import type { PipelineLog } from "../lib/pipeline-log.js";
import { logPipelinePhase, omitInternalLogFields } from "../lib/pipeline-log.js";
import { runLegacyAnalyzeProductPipeline } from "./analyze-pipeline.js";
import { retrieveEvidenceForIngredient } from "../rag/retrieve.js";
import { applyPersonalization } from "../personalization/evaluate.js";
import { createLlmClient, pickModelId } from "../llm/ollama.js";
import { queryIngredientRisks } from "../graph/neo4j.js";
import { countEvidenceRefs } from "../lib/evidence.js";
import { classificationToGeneralRisk } from "./response-enrich.js";
import { analysisRuns } from "../db/schema.js";
import { PIPELINE_VERSION } from "@ingredient-scanner/shared";
import { startSpan, endSpan, traceLangfuseEvent } from "../observability/tracing.js";
import { AGENT_PIPELINE } from "../agents/graph.js";
import {
  createPhaseTimingCollector,
  finalizeTiming,
} from "../lib/phase-timing.js";

export type AnalyzePipelineArgs = {
  db: Db;
  env: Env;
  req: AnalyzeProductRequest;
  vision: VisionClient | null;
  correlationId: string;
  log: PipelineLog;
};

function ingredientStats(response: AnalyzeProductResponse): {
  identified: number;
  unknown: number;
  fragrance: string[];
} {
  const identified = response.ingredients.filter((i) =>
    i.sources?.includes("Internal Encyclopedia"),
  ).length;
  const unknown = response.totalIngredients - identified;
  const fragrance = response.ingredients
    .filter((i) => /parfum|fragrance|linalool|citronellol|limonene|hexyl cinnamal/i.test(i.normalizedName))
    .map((i) => i.name);
  return { identified, unknown, fragrance };
}

function buildDeterministicReport(response: AnalyzeProductResponse): string {
  const { identified, unknown, fragrance } = ingredientStats(response);
  const label = response.productClassificationSubtitle.toLowerCase();
  const matchNote =
    unknown === 0
      ? `All ${identified} ingredients were identified.`
      : `${identified} of ${response.totalIngredients} ingredients were identified; ${unknown} could not be matched.`;
  if (fragrance.length > 0) {
    const names = fragrance.slice(0, 4).join(", ");
    const more = fragrance.length > 4 ? ` and ${fragrance.length - 4} more` : "";
    return `This ${label} product: ${matchNote} It includes fragrance-related components (${names}${more}) that may irritate sensitive skin. Consider a patch test if you are fragrance-sensitive.`;
  }
  return `${response.productClassificationLabel}: ${matchNote} See ingredient details below for tier and concern notes.`;
}

/** Fact-checker: evidence refs + report must not contradict match data. */
function factCheck(response: AnalyzeProductResponse, report: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const { identified, unknown } = ingredientStats(response);

  for (const ing of response.ingredients) {
    const encyclopediaMatched = ing.sources?.includes("Internal Encyclopedia");
    if (encyclopediaMatched && (!ing.evidenceRefs || ing.evidenceRefs.length === 0)) {
      issues.push(`Missing evidence for ${ing.name}`);
    }
  }

  const reportLower = report.toLowerCase();
  if (unknown === 0 && /unknown ingredient|undisclosed|unidentified ingredient/.test(reportLower)) {
    issues.push("Report claims unknown ingredients but all were identified");
  }
  if (identified > 0 && /all .* unknown|every ingredient is unknown/.test(reportLower)) {
    issues.push("Report incorrectly states all ingredients are unknown");
  }
  if (/manufacturer has not disclosed/.test(reportLower) && identified >= response.totalIngredients * 0.8) {
    issues.push("Report claims non-disclosure despite high encyclopedia match rate");
  }

  return { ok: issues.length === 0, issues };
}

async function enrichWithRagAndGraph(
  db: Db,
  env: Env,
  response: AnalyzeProductResponse,
  log: PipelineLog,
  logBase: Record<string, unknown>,
): Promise<AnalyzeProductResponse> {
  const { identified, unknown } = ingredientStats(response);
  if (unknown === 0 && identified > 0) {
    logPipelinePhase(log, logBase, "rag_skipped", 0, { reason: "encyclopedia_complete" });
    return {
      ...response,
      evidenceCount: countEvidenceRefs(response.ingredients),
      generalRisk: classificationToGeneralRisk(response.productClassification),
    };
  }

  const t0 = performance.now();
  const ingredients = await Promise.all(
    response.ingredients.map(async (ing) => {
      const ragRefs = await retrieveEvidenceForIngredient(db, env, ing.normalizedName);
      const graphRisks = await queryIngredientRisks(env, ing.normalizedName);
      const graphNote =
        graphRisks.length > 0 ? `Graph risks: ${graphRisks.join(", ")}` : undefined;
      const mergedRefs = [...(ing.evidenceRefs ?? []), ...ragRefs];
      return {
        ...ing,
        evidenceRefs: mergedRefs.length ? mergedRefs : ing.evidenceRefs,
        potentialConcerns: [ing.potentialConcerns, graphNote].filter(Boolean).join(" ") || undefined,
      };
    }),
  );

  logPipelinePhase(log, logBase, "rag_enrich", performance.now() - t0, {
    ingredient_count: ingredients.length,
  });

  return {
    ...response,
    ingredients,
    evidenceCount: countEvidenceRefs(ingredients),
    generalRisk: classificationToGeneralRisk(response.productClassification),
  };
}

function buildRecommendationPrompt(response: AnalyzeProductResponse): string {
  const { identified, unknown, fragrance } = ingredientStats(response);
  const citeIds = response.ingredients
    .flatMap((i) => i.evidenceRefs?.map((e) => e.id) ?? [])
    .slice(0, 24)
    .join(", ");

  const lines = response.ingredients
    .map((i) => {
      const status = i.description ? "identified" : "unidentified";
      const brief = i.description ? i.description.slice(0, 100) : "no encyclopedia entry";
      return `- ${i.name} [${i.tier}, ${status}]: ${brief}`;
    })
    .join("\n");

  return `Product classification: ${response.productClassificationLabel} — ${response.productClassificationSubtitle}.
Match summary: ${identified} identified, ${unknown} unidentified, out of ${response.totalIngredients} total.
${fragrance.length ? `Fragrance-related: ${fragrance.join(", ")}.` : ""}

Ingredients:
${lines}

Evidence citation IDs (cite ONLY these in square brackets): ${citeIds || "none"}

Rules:
- Do NOT say ingredients are unknown if they are marked identified above.
- Do NOT claim the manufacturer failed to disclose ingredients when DOM data was parsed.
- Mention fragrance allergens if present.
- Write exactly 3 sentences for a consumer audience.`;
}

async function runRecommendationAgent(
  env: Env,
  response: AnalyzeProductResponse,
  ingredientCount: number,
  needsOcr: boolean,
  strict = false,
): Promise<{ report: string; tokens: { in: number; out: number; model: string }; skippedLlm: boolean }> {
  const mode = env.LLM_SUMMARY ?? "auto";
  const { identified, unknown } = ingredientStats(response);

  if (mode === "off" || (mode === "auto" && unknown === 0 && identified > 0)) {
    return {
      report: buildDeterministicReport(response),
      tokens: { in: 0, out: 0, model: mode === "off" ? "deterministic" : "auto-deterministic" },
      skippedLlm: true,
    };
  }

  const llm = createLlmClient(env);
  const model = pickModelId(env, ingredientCount, needsOcr);

  try {
    const completion = await llm.complete(
      [
        {
          role: "system",
          content:
            "You are a consumer product safety analyst. Only use facts from the user message. Do not include raw citation IDs in the response. Never invent unknown-status for identified ingredients.",
        },
        {
          role: "user",
          content: strict
            ? `${buildRecommendationPrompt(response)}\n\nSTRICT: If all ingredients are identified, explicitly say they were matched to the encyclopedia. No bracket citation IDs in output.`
            : `${buildRecommendationPrompt(response)}\n\nWrite 2-3 short sentences for shoppers. No bracket citation IDs in output.`,
        },
      ],
      model,
    );
    return {
      report: completion.text,
      tokens: { in: completion.inputTokens, out: completion.outputTokens, model },
      skippedLlm: false,
    };
  } catch {
    return {
      report: buildDeterministicReport(response),
      tokens: { in: 0, out: 0, model: "deterministic" },
      skippedLlm: true,
    };
  }
}

export async function runAnalyzeProductPipeline(args: AnalyzePipelineArgs): Promise<AnalyzeProductResponse> {
  const timing = createPhaseTimingCollector();
  const logBase: Record<string, unknown> = {
    correlation_id: args.correlationId,
    request_started_at: timing.requestStartedAt,
    timing_collector: timing,
  };

  startSpan(args.correlationId, "agent_coordinator", {
    agents: AGENT_PIPELINE.join("->"),
    started_at: new Date(timing.requestStartedAt).toISOString(),
  });
  await traceLangfuseEvent({ correlationId: args.correlationId, name: "analyze_start" });

  const legacy = await runLegacyAnalyzeProductPipeline({ ...args, timingCollector: timing });

  if (legacy.resultSource === "cache") {
    const tCache = performance.now();
    let response = applyPersonalization(legacy, args.req.userPreferences);
    const report = buildDeterministicReport(response);
    response = { ...response, agentReport: report };

    logPipelinePhase(args.log, logBase, "cache_fast_path", performance.now() - tCache, {
      skipped_rag: true,
      skipped_llm: true,
    });

    const timingSummary = finalizeTiming(timing);
    void args.db
      .insert(analysisRuns)
      .values({
        analysisId: response.analysisId ?? null,
        correlationId: args.correlationId,
        wallMs: timingSummary.totalMs,
        visionUnits: 0,
        embeddingCalls: 0,
        llmInputTokens: 0,
        llmOutputTokens: 0,
        modelId: "cache",
        pipelineVersion: PIPELINE_VERSION,
      })
      .catch(() => {
        /* telemetry table may not exist yet */
      });

    endSpan(args.correlationId, "agent_coordinator");
    void traceLangfuseEvent({
      correlationId: args.correlationId,
      name: "analyze_complete",
      metadata: { wall_ms: timingSummary.totalMs, cache_fast_path: true },
    });

    args.log.info(
      {
        ...omitInternalLogFields(logBase),
        event: "analyze_complete",
        result_source: "cache",
        cache_fast_path: true,
        total_ms: timingSummary.totalMs,
        timestamp: timingSummary.completedAt,
        ingredient_count: response.totalIngredients,
      },
      "analyze_complete",
    );

    return response;
  }

  let response = await enrichWithRagAndGraph(args.db, args.env, legacy, args.log, logBase);

  const needsOcr = response.provenance !== "dom";
  let tRec = performance.now();
  let rec = await runRecommendationAgent(
    args.env,
    response,
    response.totalIngredients,
    needsOcr,
  );
  logPipelinePhase(args.log, logBase, "agent_recommendation", performance.now() - tRec, {
    model: rec.tokens.model,
    skipped_llm: rec.skippedLlm,
  });

  let check = factCheck(response, rec.report);
  if (!check.ok) {
    args.log.warn({
      ...omitInternalLogFields(logBase),
      event: "fact_check_failed",
      msg: "fact_check_failed",
      issues: check.issues,
      timestamp: new Date().toISOString(),
    });
    tRec = performance.now();
    rec = await runRecommendationAgent(
      args.env,
      response,
      response.totalIngredients,
      needsOcr,
      true,
    );
    logPipelinePhase(args.log, logBase, "agent_recommendation_retry", performance.now() - tRec);
    check = factCheck(response, rec.report);
    if (!check.ok) {
      rec = { report: buildDeterministicReport(response), tokens: rec.tokens, skippedLlm: true };
      response = {
        ...response,
        warnings: [
          ...(response.warnings ?? []),
          `AI summary adjusted: ${check.issues.slice(0, 2).join("; ")}`,
        ],
      };
    }
  }

  response = { ...response, agentReport: rec.report };

  tRec = performance.now();
  response = applyPersonalization(response, args.req.userPreferences);
  logPipelinePhase(args.log, logBase, "agent_personalization", performance.now() - tRec);

  const evidenceCheck = factCheck(response, rec.report);
  if (!evidenceCheck.ok && !response.warnings?.some((w) => w.startsWith("Fact-check"))) {
    response = {
      ...response,
      warnings: [...(response.warnings ?? []), `Fact-check notes: ${evidenceCheck.issues.slice(0, 3).join("; ")}`],
    };
  }

  const timingSummary = finalizeTiming(timing);

  try {
    await args.db.insert(analysisRuns).values({
      analysisId: response.analysisId ?? null,
      correlationId: args.correlationId,
      wallMs: timingSummary.totalMs,
      visionUnits: needsOcr ? 1 : 0,
      embeddingCalls: response.totalIngredients,
      llmInputTokens: rec.tokens.in,
      llmOutputTokens: rec.tokens.out,
      modelId: rec.tokens.model,
      pipelineVersion: PIPELINE_VERSION,
    });
  } catch {
    /* telemetry table may not exist yet */
  }

  endSpan(args.correlationId, "agent_coordinator");
  void traceLangfuseEvent({
    correlationId: args.correlationId,
    name: "analyze_complete",
    metadata: { wall_ms: timingSummary.totalMs, phases: timingSummary.phases.length },
  });

  args.log.info(
    {
      ...omitInternalLogFields(logBase),
      event: "analyze_complete",
      result_source: response.resultSource,
      total_ms: timingSummary.totalMs,
      timestamp: timingSummary.completedAt,
      ingredient_count: response.totalIngredients,
      skipped_llm: rec.skippedLlm,
    },
    "analyze_complete",
  );

  return response;
}
