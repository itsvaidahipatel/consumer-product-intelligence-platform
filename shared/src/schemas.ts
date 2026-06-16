import { z } from "zod";

export const ImageMetaSchema = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Alt text when available — used to prioritize label/back images for OCR. */
  alt: z.string().optional(),
});

export const UserPreferencesSchema = z.object({
  vegan: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  pregnancy: z.boolean().optional(),
  nutAllergy: z.boolean().optional(),
  dairyAllergy: z.boolean().optional(),
  sensitiveSkin: z.boolean().optional(),
  fragranceSensitivity: z.boolean().optional(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const AnalyzeProductRequestSchema = z.object({
  url: z.string().url(),
  siteId: z.string().min(1),
  productName: z.string().min(1),
  rawIngredientText: z.string(),
  locale: z.string().default("en-IN"),
  imageUrls: z.array(z.string().url()).default([]),
  imageMeta: z.array(ImageMetaSchema).default([]),
  retailerProductId: z.string().optional(),
  forceRefresh: z.boolean().optional(),
  analysisMode: z.enum(["DOM_ONLY", "DOM_AND_VISION"]).default("DOM_AND_VISION"),
  userPreferences: UserPreferencesSchema.optional(),
  profileHash: z.string().max(128).optional(),
});

export type AnalyzeProductRequest = z.infer<typeof AnalyzeProductRequestSchema>;

export const RegulatoryMapSchema = z.record(
  z.string().min(2).max(8),
  z.enum(["allowed", "restricted", "banned"]),
);

export const EvidenceRefSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["pubchem", "regulation", "llm_summary", "manual", "encyclopedia", "rag_chunk"]),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  url: z.string().url().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "SEVERE"]);

export const IngredientResultSchema = z.object({
  name: z.string(),
  normalizedName: z.string(),
  tier: z.enum(["GREEN", "BLUE", "RED", "BLACK"]),
  description: z.string().optional(),
  function: z.string().optional(),
  regulatoryStatus: RegulatoryMapSchema.optional(),
  provenance: z.enum(["retailer_page", "product_images", "both"]),
  shortNote: z.string().optional(),
  potentialConcerns: z.string().optional(),
  sources: z.array(z.string()).optional(),
  evidenceRefs: z.array(EvidenceRefSchema).optional(),
});

export type IngredientResult = z.infer<typeof IngredientResultSchema>;

export const AnalyzeProductResponseSchema = z.object({
  correlationId: z.string(),
  /** Present when the run is backed by a row in `product_analyses` (cache hit, fresh persist, or GET /analysis/:id). */
  analysisId: z.string().uuid().optional(),
  resultSource: z.enum(["cache", "fresh_pipeline", "stored"]),
  cacheReason: z.string().optional(),
  completenessFlag: z.boolean(),
  analysisStatus: z.enum(["COMPLETE", "INCOMPLETE"]),
  productClassification: z.enum(["GREEN", "BLUE", "RED", "BLACK", "YELLOW"]),
  productClassificationLabel: z.string(),
  productClassificationSubtitle: z.string(),
  provenance: z.enum(["dom", "ocr", "merged"]),
  winningReasonCode: z.string(),
  confidenceScore: z.number(),
  ingredients: z.array(IngredientResultSchema),
  tierCounts: z.object({
    GREEN: z.number(),
    BLUE: z.number(),
    RED: z.number(),
    BLACK: z.number(),
  }),
  totalIngredients: z.number(),
  warnings: z.array(z.string()).optional(),
  generalRisk: RiskLevelSchema.optional(),
  personalizedRisk: RiskLevelSchema.optional(),
  personalizationReasons: z.array(z.string()).optional(),
  evidenceCount: z.number().optional(),
  agentReport: z.string().optional(),
  timing: z
    .object({
      startedAt: z.string(),
      completedAt: z.string(),
      totalMs: z.number(),
      phases: z.array(
        z.object({
          phase: z.string(),
          durationMs: z.number(),
          timestamp: z.string(),
          elapsedMs: z.number(),
        }),
      ),
    })
    .optional(),
});

export type AnalyzeProductResponse = z.infer<typeof AnalyzeProductResponseSchema>;

export const AnalysisFeedbackRequestSchema = z.object({
  analysisId: z.string().uuid(),
  vote: z.enum(["helpful", "not_helpful", "incorrect", "flag"]),
  labels: z.array(z.string().min(1).max(64)).max(24).default([]),
  comment: z.string().max(4000).optional(),
  clientHints: z.record(z.unknown()).optional(),
});

export type AnalysisFeedbackRequest = z.infer<typeof AnalysisFeedbackRequestSchema>;
