import {
  CACHE_MAX_AGE_DAYS,
  PIPELINE_VERSION,
  SCHEMA_VERSION,
  sanitizeDomIngredientBlob,
  scoreProductImageForIngredients,
  type IngredientResult,
  type IngredientTier,
  type ProductClassification,
  type AnalyzeProductRequest,
  type AnalyzeProductResponse,
} from "@ingredient-scanner/shared";
import { encyclopediaEvidenceRefs, countEvidenceRefs } from "../lib/evidence.js";
import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  canonicalIngredients,
  ingredientRegulatoryStatus,
  productAnalyses,
  productAnalysisIngredients,
  retailers,
} from "../db/schema.js";
import { evaluateIngredientCompleteness } from "./completeness.js";
import { fetchImagesBounded, sha256Hex } from "./image-fetch.js";
import { findLatestCacheableAnalysis, matchIngredientTokens } from "./ingredient-match.js";
import { classifyProduct, labelsForProductClassification } from "./product-classification.js";
import type { VisionClient } from "./vision.js";
import { logAnalyzeMilestone, logPipelinePhase, nowMs, type PipelineLog } from "../lib/pipeline-log.js";
import {
  selectDomOnlyForVisionGate,
  selectWinningIngredientCandidate,
} from "./scored-candidate-selection.js";
import { classifyProductCategory } from "./product-category.js";
import { findCachedOcrRun, persistOcrRun } from "./ocr-persist.js";
import type { RichDocumentOcrResult } from "./vision.js";
import type { PhaseTimingCollector } from "../lib/phase-timing.js";

const CACHE_MIN_CONFIDENCE = 0.72;
const MAX_VISION_IMAGES = 6;

function rankVisionImageUrls(urls: string[], meta: AnalyzeProductRequest["imageMeta"]): string[] {
  const scored = urls.map((url, i) => ({
    url,
    score: scoreProductImageForIngredients(url, meta[i]?.alt),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.url);
}

function requestLogContext(req: AnalyzeProductRequest): Record<string, unknown> {
  let urlHost = "unknown";
  try {
    urlHost = new URL(req.url).hostname;
  } catch {
    /* ignore */
  }
  return {
    site_id: req.siteId,
    url_host: urlHost,
    retailer_product_id: req.retailerProductId?.trim() || "unknown",
    image_url_count: req.imageUrls.length,
    analysis_mode: req.analysisMode,
    force_refresh: Boolean(req.forceRefresh),
    raw_text_chars: req.rawIngredientText.length,
  };
}

const MIN_COMPLETE_INGREDIENTS = 8;

function shouldRunVision(args: {
  mode: "DOM_ONLY" | "DOM_AND_VISION";
  raw: string;
  domTokenCount: number;
  completenessFlag: boolean;
  hasImages: boolean;
}): boolean {
  if (args.mode === "DOM_ONLY") return false;
  if (!args.hasImages) return false;
  if (!args.raw.trim()) return true;
  if (args.domTokenCount < MIN_COMPLETE_INGREDIENTS) return true;
  if (!args.completenessFlag) return true;
  return false;
}

function provenanceForSource(source: "dom" | "ocr" | "merged"): "retailer_page" | "product_images" | "both" {
  if (source === "dom") return "retailer_page";
  if (source === "ocr") return "product_images";
  return "both";
}

function shortWarning(tier: IngredientTier, description?: string): string | undefined {
  if (tier === "BLACK") return "Severe concern; avoid when possible.";
  if (tier === "RED") return "Higher concern or common irritant/allergen.";
  if (tier === "BLUE") return description ?? "Generally acceptable; note for sensitive users.";
  return description ?? "Low concern in typical use.";
}

function classificationToGeneralRisk(
  c: ProductClassification,
): "LOW" | "MEDIUM" | "HIGH" | "SEVERE" {
  if (c === "GREEN") return "LOW";
  if (c === "BLUE" || c === "YELLOW") return "MEDIUM";
  if (c === "RED") return "HIGH";
  return "SEVERE";
}

function withRiskMeta(
  base: AnalyzeProductResponse,
  ingredients: IngredientResult[],
): AnalyzeProductResponse {
  return {
    ...base,
    ingredients,
    evidenceCount: countEvidenceRefs(ingredients),
    generalRisk: classificationToGeneralRisk(base.productClassification),
  };
}

function toIngredientResults(
  matched: Awaited<ReturnType<typeof matchIngredientTokens>>,
  provenance: "retailer_page" | "product_images" | "both",
): IngredientResult[] {
  return matched.map((m) => ({
    name: m.displayName,
    normalizedName: m.normalizedName,
    tier: m.tier,
    description: m.description,
    function: m.function,
    regulatoryStatus: Object.keys(m.regulatory).length ? m.regulatory : undefined,
    provenance,
    shortNote: shortWarning(m.tier, m.description),
    potentialConcerns: m.tier === "RED" || m.tier === "BLACK" ? m.description : undefined,
    sources: m.canonicalId ? ["Internal Encyclopedia"] : undefined,
    evidenceRefs: m.canonicalId
      ? encyclopediaEvidenceRefs({
          canonicalId: m.canonicalId,
          displayName: m.displayName,
          description: m.description,
          dataSource: m.dataSource,
        })
      : undefined,
  }));
}

/** Rebuild the public analyze payload from a persisted `product_analyses` row (cache hit, GET by id, etc.). */
export async function buildStoredAnalysisResponse(
  db: Db,
  analysisId: string,
  responseCorrelationId: string,
  log: PipelineLog,
  logBase: Record<string, unknown>,
  opts: { resultSource: "cache" | "stored"; cacheReason?: string },
): Promise<AnalyzeProductResponse | null> {
  const tLoad = nowMs();
  const [rows, analysis] = await Promise.all([
    db
      .select({
        pai: productAnalysisIngredients,
        ci: canonicalIngredients,
      })
      .from(productAnalysisIngredients)
      .leftJoin(canonicalIngredients, eq(productAnalysisIngredients.normalizedIngredientId, canonicalIngredients.id))
      .where(eq(productAnalysisIngredients.analysisId, analysisId))
      .orderBy(asc(productAnalysisIngredients.orderIndex)),
    db.select().from(productAnalyses).where(eq(productAnalyses.id, analysisId)).limit(1),
  ]);

  const meta = analysis[0];
  if (!meta) {
    logPipelinePhase(log, logBase, "cache_load", nowMs() - tLoad, {
      analysis_id: analysisId,
      meta_found: false,
    });
    return null;
  }

  const canonIds = [
    ...new Set(
      rows.map((r) => r.pai.normalizedIngredientId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const regulatoryByIngredientId = new Map<
    string,
    Record<string, "allowed" | "restricted" | "banned">
  >();
  if (canonIds.length > 0) {
    const regs = await db
      .select()
      .from(ingredientRegulatoryStatus)
      .where(inArray(ingredientRegulatoryStatus.ingredientId, canonIds));
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

  logPipelinePhase(log, logBase, "cache_load", nowMs() - tLoad, {
    analysis_id: analysisId,
    row_count: rows.length,
    meta_found: true,
  });

  const ingredients: IngredientResult[] = rows.map(({ pai, ci }) => {
    const tier = pai.tierUsed;
    const regMap = pai.normalizedIngredientId
      ? regulatoryByIngredientId.get(pai.normalizedIngredientId)
      : undefined;
    const display = ci?.displayName ?? pai.displayNameSnapshot ?? pai.rawToken;
    const norm = ci?.normalizedName ?? pai.rawToken.toLowerCase();
    return {
      name: display,
      normalizedName: norm,
      tier,
      description: ci?.description ?? undefined,
      function: ci?.functionDescription ?? undefined,
      regulatoryStatus:
        regMap && Object.keys(regMap).length > 0 ? { ...regMap } : undefined,
      provenance: pai.provenance as IngredientResult["provenance"],
      shortNote: shortWarning(tier, ci?.description ?? undefined),
      potentialConcerns:
        tier === "RED" || tier === "BLACK" ? (ci?.description ?? undefined) : undefined,
      sources: pai.normalizedIngredientId ? ["Internal Encyclopedia"] : undefined,
      evidenceRefs: pai.normalizedIngredientId
        ? encyclopediaEvidenceRefs({
            canonicalId: pai.normalizedIngredientId,
            displayName: display,
            description: ci?.description ?? undefined,
            dataSource: ci?.dataSource,
          })
        : undefined,
    };
  });

  const tierCountsFromRows = ingredients.reduce(
    (acc, i) => {
      acc[i.tier] += 1;
      return acc;
    },
    { GREEN: 0, BLUE: 0, RED: 0, BLACK: 0 },
  );

  const summary = meta.analysisSummaryJson;
  const tierCounts = summary?.tierCounts ?? tierCountsFromRows;

  const completenessFlag = meta.completenessFlag;
  const tiers = ingredients.map((i) => i.tier);
  const banner =
    meta.productClassification != null
      ? {
          classification: meta.productClassification as ProductClassification,
          ...labelsForProductClassification(meta.productClassification as ProductClassification),
        }
      : classifyProduct(completenessFlag, tiers);

  return withRiskMeta(
    {
      correlationId: responseCorrelationId,
      analysisId,
      resultSource: opts.resultSource,
      cacheReason: opts.cacheReason,
      completenessFlag,
      analysisStatus: completenessFlag ? "COMPLETE" : "INCOMPLETE",
      productClassification: banner.classification,
      productClassificationLabel: banner.label,
      productClassificationSubtitle: banner.subtitle,
      provenance: meta.provenance as AnalyzeProductResponse["provenance"],
      winningReasonCode: summary?.winningReasonCode ?? "cache",
      confidenceScore: meta.confidenceScore ?? 0,
      ingredients,
      tierCounts,
      totalIngredients: ingredients.length,
      warnings: completenessFlag
        ? undefined
        : [
            "The ingredient list appears incomplete. Results may be inaccurate. Try another retailer, OCR, or refresh.",
          ],
    },
    ingredients,
  );
}

export async function runLegacyAnalyzeProductPipeline(args: {
  db: Db;
  req: AnalyzeProductRequest;
  vision: VisionClient | null;
  correlationId: string;
  log: PipelineLog;
  timingCollector?: PhaseTimingCollector;
}): Promise<AnalyzeProductResponse> {
  const { db, req, vision, correlationId, log, timingCollector } = args;
  const pipelineT0 = nowMs();
  const requestStartedAt = timingCollector?.requestStartedAt ?? Date.now();
  const logBase: Record<string, unknown> = {
    correlation_id: correlationId,
    request_started_at: requestStartedAt,
    timing_collector: timingCollector,
    ...requestLogContext(req),
  };

  logPipelinePhase(log, logBase, "pipeline_enter", 0, {
    pipeline_version: PIPELINE_VERSION,
    schema_version: SCHEMA_VERSION,
  });

  const urlHash = sha256Hex(req.url);
  const retailerProductId = req.retailerProductId?.trim() || "unknown";
  const sanitizedDom = sanitizeDomIngredientBlob(req.rawIngredientText.trim());

  if (!req.forceRefresh) {
    let t = nowMs();
    const cached = await findLatestCacheableAnalysis(db, {
      siteId: req.siteId,
      retailerProductId,
      urlHash,
      pipelineVersion: PIPELINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      maxAgeDays: CACHE_MAX_AGE_DAYS,
      minConfidence: CACHE_MIN_CONFIDENCE,
    });
    logPipelinePhase(log, logBase, "cache_lookup_db", nowMs() - t, {
      cache_hit: Boolean(cached),
      analysis_id: cached?.id,
    });

    if (cached) {
      const out = await buildStoredAnalysisResponse(db, cached.id, correlationId, log, logBase, {
        resultSource: "cache",
        cacheReason: "valid_complete_analysis",
      });
      if (!out) {
        throw new Error("cache_corrupt_missing_analysis");
      }
      logPipelinePhase(log, logBase, "pipeline_total", nowMs() - pipelineT0, {
        result_source: "cache",
        total_ingredients: out.totalIngredients,
      });
      return out;
    }
  } else {
    logPipelinePhase(log, logBase, "cache_lookup_skipped", 0, { reason: "force_refresh" });
  }

  const rankedVisionUrls = rankVisionImageUrls(req.imageUrls, req.imageMeta).slice(
    0,
    MAX_VISION_IMAGES,
  );

  let tDom = nowMs();
  const { pick: domGatePick, completeness: domCompleteness } = await selectDomOnlyForVisionGate({
    db,
    domRaw: sanitizedDom,
  });
  logPipelinePhase(log, logBase, "dom_scored_candidates_gate", nowMs() - tDom, {
    dom_token_count: domGatePick.tokens.length,
    dom_completeness_flag: domCompleteness.completenessFlag,
    vision_ranked_urls: rankedVisionUrls.length,
    winning_reason_dom_gate: domGatePick.winningReasonCode,
  });

  let ocrText: string | undefined;
  let ocrMeanConfidence: number | undefined;
  let ocrChunkList: string[] | undefined;
  const pendingOcrPersists: {
    imageUrl: string;
    imageUrlHash: string;
    result: RichDocumentOcrResult;
  }[] = [];

  const wantsVision = shouldRunVision({
    mode: req.analysisMode,
    raw: (domGatePick.winningRawText || sanitizedDom).trim(),
    domTokenCount: domGatePick.tokens.length,
    completenessFlag: domCompleteness.completenessFlag,
    hasImages: rankedVisionUrls.length > 0,
  });

  const pipelineWarnings: string[] = [];
  if (req.analysisMode !== "DOM_ONLY" && rankedVisionUrls.length === 0) {
    pipelineWarnings.push(
      "No product images were captured from this page, so pack-label OCR was skipped.",
    );
  }

  logPipelinePhase(log, logBase, "vision_decision", 0, {
    wants_vision: wantsVision,
    vision_configured: Boolean(vision),
    vision_image_count: rankedVisionUrls.length,
    dom_token_count: domGatePick.tokens.length,
  });

  logAnalyzeMilestone(log, logBase, "dom_scored", {
    dom_token_count: domGatePick.tokens.length,
    dom_completeness_flag: domCompleteness.completenessFlag,
    vision_ranked_urls: rankedVisionUrls.length,
  });

  if (wantsVision) {
    if (!vision) {
      pipelineWarnings.push(
        "Pack-label OCR is not configured on the API. Set GOOGLE_VISION_CREDENTIALS_JSON in Railway to enable Vision.",
      );
      logPipelinePhase(log, logBase, "vision_skipped", 0, { reason: "not_configured" });
    } else {
    logAnalyzeMilestone(log, logBase, "vision_start", {
      image_count: rankedVisionUrls.length,
    });
    const visionPhaseStart = nowMs();
    let t = nowMs();
    const buffers = await fetchImagesBounded(rankedVisionUrls);
    const totalBytes = buffers.reduce((acc, b) => acc + b.length, 0);
    logPipelinePhase(log, logBase, "vision_fetch_images", nowMs() - t, {
      fetched_count: buffers.length,
      requested_count: rankedVisionUrls.length,
      total_bytes: totalBytes,
      nonempty_fetch_count: buffers.filter((b) => b.length >= 80).length,
    });

    const ocrChunks: string[] = new Array(buffers.length);
    const confidences: number[] = new Array(buffers.length);
    const VISION_CONCURRENCY = 3;
    for (let i = 0; i < buffers.length; i += VISION_CONCURRENCY) {
      const slice = buffers.slice(i, i + VISION_CONCURRENCY);
      const urlSlice = rankedVisionUrls.slice(i, i + VISION_CONCURRENCY);
      const tBatch = nowMs();
      const part = await Promise.all(
        slice.map(async (buf, j) => {
          const url = urlSlice[j] ?? "";
          const imageUrlHash = sha256Hex(url);
          if (!req.forceRefresh && url) {
            const cached = await findCachedOcrRun(db, imageUrlHash);
            if (cached) {
              return {
                text: cached.parsedText,
                confidence: cached.meanConfidence ?? 0.65,
                boundingBoxes: cached.boundingBoxes,
                rawAnnotation: undefined,
                fromCache: true as const,
                imageUrl: url,
                imageUrlHash,
              };
            }
          }
          if (buf.length < 80) {
            return {
              text: "",
              confidence: 0,
              boundingBoxes: [],
              rawAnnotation: undefined,
              fromCache: false as const,
              imageUrl: url,
              imageUrlHash,
            };
          }
          try {
            const rich = await vision.documentTextRichFromBuffer(buf);
            return {
              ...rich,
              fromCache: false as const,
              imageUrl: url,
              imageUrlHash,
            };
          } catch {
            return {
              text: "",
              confidence: 0,
              boundingBoxes: [],
              rawAnnotation: undefined,
              fromCache: false as const,
              imageUrl: url,
              imageUrlHash,
            };
          }
        }),
      );
      logPipelinePhase(log, logBase, "vision_ocr_batch", nowMs() - tBatch, {
        batch_start_index: i,
        batch_size: slice.length,
        slice_ms_mean: Math.round((nowMs() - tBatch) / Math.max(1, slice.length)),
      });
      part.forEach((ocr, j) => {
        const idx = i + j;
        if (ocr.text) ocrChunks[idx] = ocr.text;
        confidences[idx] = ocr.confidence;
        if (!ocr.fromCache && ocr.text && ocr.imageUrl) {
          pendingOcrPersists.push({
            imageUrl: ocr.imageUrl,
            imageUrlHash: ocr.imageUrlHash,
            result: {
              text: ocr.text,
              confidence: ocr.confidence,
              boundingBoxes: ocr.boundingBoxes,
              rawAnnotation: ocr.rawAnnotation,
            },
          });
        }
      });
    }
    const ocrTextJoined = ocrChunks.filter(Boolean).join("\n");
    const confVals = confidences.filter((c) => typeof c === "number");
    ocrText = ocrTextJoined;
    ocrMeanConfidence =
      confVals.length > 0 ? confVals.reduce((a, b) => a + b, 0) / confVals.length : undefined;

    const trimmedChunks = ocrChunks.map((c) => c?.trim() ?? "").filter(Boolean);
    ocrChunkList = trimmedChunks.length > 0 ? trimmedChunks : undefined;

    logPipelinePhase(log, logBase, "ocr_per_image", nowMs() - visionPhaseStart, {
      ocr_chunk_count: trimmedChunks.length,
      ocr_char_total: ocrText.length,
      ocr_mean_confidence: ocrMeanConfidence,
    });
    if (trimmedChunks.length === 0 && rankedVisionUrls.length > 0) {
      pipelineWarnings.push(
        "Product images could not be read (fetch or OCR returned empty). Try refreshing the product page.",
      );
    }
    logAnalyzeMilestone(log, logBase, "vision_done", {
      ocr_chunk_count: trimmedChunks.length,
      ocr_char_total: ocrText.length,
    });
    }
  }

  let tPick = nowMs();
  const pick = await selectWinningIngredientCandidate({
    db,
    domRaw: sanitizedDom,
    ocrChunks: ocrChunkList,
    ocrMeanConfidence,
  });
  logPipelinePhase(log, logBase, "scored_candidate_selection", nowMs() - tPick, {
    winning_source: pick.source,
    winning_reason: pick.winningReasonCode,
    pick_confidence: pick.confidence,
    final_token_count: pick.tokens.length,
  });

  const textForCompleteness =
    pick.tokens.length > 0
      ? `${pick.winningRawText.trim()}\n${pick.tokens.join(", ")}`.trim()
      : pick.winningRawText.trim() || sanitizedDom.trim();

  if (pick.tokens.length === 0) {
    pipelineWarnings.push(
      "No ingredients were found on the retailer page or in product images. Reload the tab, ensure Ingredients is visible on Amazon, and try Fresh Run.",
    );
  }

  let tFin = nowMs();
  const finalCompleteness = evaluateIngredientCompleteness(textForCompleteness, pick.tokens);
  logPipelinePhase(log, logBase, "final_completeness_eval", nowMs() - tFin, {
    final_completeness_flag: finalCompleteness.completenessFlag,
    final_confidence_score: finalCompleteness.confidenceScore,
  });

  const trackMatch = (phase: string, durationMs: number, extra?: Record<string, unknown>) => {
    logPipelinePhase(log, logBase, phase, durationMs, extra);
  };

  let tMatch = nowMs();
  const matched = await matchIngredientTokens(db, pick.tokens, trackMatch);
  logPipelinePhase(log, logBase, "ingredient_match_total", nowMs() - tMatch, {
    matched_count: matched.length,
  });

  logAnalyzeMilestone(log, logBase, "tokens_matched", {
    winning_source: pick.source,
    final_token_count: pick.tokens.length,
    matched_count: matched.length,
  });

  const ingredientRows = toIngredientResults(matched, provenanceForSource(pick.source));

  const tierCounts = ingredientRows.reduce(
    (acc, i) => {
      acc[i.tier] += 1;
      return acc;
    },
    { GREEN: 0, BLUE: 0, RED: 0, BLACK: 0 },
  );

  let tBanner = nowMs();
  const banner = classifyProduct(finalCompleteness.completenessFlag, ingredientRows.map((i) => i.tier));
  logPipelinePhase(log, logBase, "product_classify_banner", nowMs() - tBanner, {
    classification: banner.classification,
  });

  const confidenceScore = Math.min(1, (pick.confidence + finalCompleteness.confidenceScore) / 2);

  const analyzedAt = new Date();

  let tTx = nowMs();
  let persistedAnalysisId = "";
  await db.transaction(async (tx) => {
    await tx
      .insert(retailers)
      .values({
        siteId: req.siteId,
        label: req.siteId.replace(/_/g, " "),
      })
      .onConflictDoNothing();

    const [inserted] = await tx
      .insert(productAnalyses)
      .values({
        siteId: req.siteId,
        retailerProductId,
        productName: req.productName,
        productUrl: req.url,
        urlHash,
        provenance: pick.source,
        completenessFlag: finalCompleteness.completenessFlag,
        pipelineVersion: PIPELINE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        analyzedAt,
        correlationId,
        confidenceScore,
        productClassification: banner.classification,
        rawIngredientText: textForCompleteness,
        productDescription: null,
        analysisSummaryJson: {
          winningReasonCode: pick.winningReasonCode,
          tierCounts,
        },
        productUnderstandingJson: {
          product_name: req.productName,
          category: classifyProductCategory(req.productName, req.siteId),
          ingredients: pick.tokens,
          sources: {
            dom: sanitizedDom || undefined,
            ocr: ocrText || undefined,
          },
        },
      })
      .returning({ id: productAnalyses.id });

    persistedAnalysisId = inserted?.id ?? "";
    if (!persistedAnalysisId) throw new Error("Failed to persist analysis");

    if (matched.length > 0) {
      await tx.insert(productAnalysisIngredients).values(
        matched.map((m, orderIndex) => ({
          analysisId: persistedAnalysisId,
          rawToken: m.rawToken,
          normalizedIngredientId: m.canonicalId,
          tierUsed: m.tier,
          orderIndex,
          provenance: provenanceForSource(pick.source),
          displayNameSnapshot: m.displayName,
          matchConfidence: m.canonicalId != null ? 1 : null,
        })),
      );
    }
  });
  logPipelinePhase(log, logBase, "persist_analysis_transaction", nowMs() - tTx, {
    ingredient_row_count: matched.length,
    analysis_id: persistedAnalysisId,
  });

  if (pendingOcrPersists.length > 0 && persistedAnalysisId) {
    await Promise.all(
      pendingOcrPersists.map((p) =>
        persistOcrRun(db, {
          analysisId: persistedAnalysisId,
          imageUrl: p.imageUrl,
          imageUrlHash: p.imageUrlHash,
          parsedText: p.result.text,
          meanConfidence: p.result.confidence,
          boundingBoxes: p.result.boundingBoxes,
          rawAnnotation: p.result.rawAnnotation,
        }),
      ),
    );
  }

  logPipelinePhase(log, logBase, "pipeline_total", nowMs() - pipelineT0, {
    result_source: "fresh_pipeline",
    total_ingredients: ingredientRows.length,
  });

  return withRiskMeta(
    {
      correlationId,
      analysisId: persistedAnalysisId,
      resultSource: "fresh_pipeline",
      completenessFlag: finalCompleteness.completenessFlag,
      analysisStatus: finalCompleteness.completenessFlag ? "COMPLETE" : "INCOMPLETE",
      productClassification: banner.classification,
      productClassificationLabel: banner.label,
      productClassificationSubtitle: banner.subtitle,
      provenance: pick.source,
      winningReasonCode: pick.winningReasonCode,
      confidenceScore,
      ingredients: ingredientRows,
      tierCounts,
      totalIngredients: ingredientRows.length,
      warnings: finalCompleteness.completenessFlag
        ? pipelineWarnings.length > 0
          ? pipelineWarnings
          : undefined
        : [
            "The ingredient list appears incomplete. Results may be inaccurate. Try another retailer, OCR, or refresh.",
            ...pipelineWarnings,
          ],
    },
    ingredientRows,
  );
}
