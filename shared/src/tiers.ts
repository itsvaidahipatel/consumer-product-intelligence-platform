export const IngredientTier = {
  GREEN: "GREEN",
  BLUE: "BLUE",
  RED: "RED",
  BLACK: "BLACK",
} as const;

export type IngredientTier = (typeof IngredientTier)[keyof typeof IngredientTier];

export const ProductClassification = {
  GREEN: "GREEN",
  BLUE: "BLUE",
  RED: "RED",
  BLACK: "BLACK",
  YELLOW: "YELLOW",
} as const;

export type ProductClassification =
  (typeof ProductClassification)[keyof typeof ProductClassification];

export const AnalysisStatus = {
  COMPLETE: "COMPLETE",
  INCOMPLETE: "INCOMPLETE",
} as const;

export type AnalysisStatus = (typeof AnalysisStatus)[keyof typeof AnalysisStatus];

export const Provenance = {
  RETAILER_PAGE: "retailer_page",
  PRODUCT_IMAGES: "product_images",
  BOTH: "both",
} as const;

export type Provenance = (typeof Provenance)[keyof typeof Provenance];

export const PipelineProvenance = {
  DOM: "dom",
  OCR: "ocr",
  MERGED: "merged",
} as const;

export type PipelineProvenance =
  (typeof PipelineProvenance)[keyof typeof PipelineProvenance];

export const WinningReasonCode = {
  DOM_HIGHER_CONFIDENCE: "dom_higher_confidence",
  OCR_HIGHER_CONFIDENCE: "ocr_higher_confidence",
  MERGED_UNION: "merged_union",
  DOM_COMPLETE_OCR_INCOMPLETE: "dom_complete_ocr_incomplete",
  OCR_COMPLETE_DOM_INCOMPLETE: "ocr_complete_dom_incomplete",
} as const;

export type WinningReasonCode =
  (typeof WinningReasonCode)[keyof typeof WinningReasonCode];

export const RegulatoryStatusValue = {
  ALLOWED: "allowed",
  RESTRICTED: "restricted",
  BANNED: "banned",
} as const;

export type RegulatoryStatusValue =
  (typeof RegulatoryStatusValue)[keyof typeof RegulatoryStatusValue];
