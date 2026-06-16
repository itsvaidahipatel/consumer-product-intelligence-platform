import { z } from "zod";

export const ImageMetaSchema = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Alt text when available — used to prioritize label/back images for OCR. */
  alt: z.string().optional(),
});

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
});

export type AnalyzeProductRequest = z.infer<typeof AnalyzeProductRequestSchema>;

export const RegulatoryMapSchema = z.record(
  z.string().min(2).max(8),
  z.enum(["allowed", "restricted", "banned"]),
);

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
});

export type IngredientResult = z.infer<typeof IngredientResultSchema>;

export const AnalyzeProductResponseSchema = z.object({
  correlationId: z.string(),
  resultSource: z.enum(["cache", "fresh_pipeline"]),
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
});

export type AnalyzeProductResponse = z.infer<typeof AnalyzeProductResponseSchema>;
