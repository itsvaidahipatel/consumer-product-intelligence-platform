import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";

export type ProductFlag = AnalyzeProductResponse["productClassification"];
export type IngredientTier = AnalyzeProductResponse["ingredients"][number]["tier"];

export const FLAG_LABELS: Record<ProductFlag, string> = {
  BLACK: "Completely Avoid",
  RED: "Use With Caution",
  BLUE: "Moderate Concern",
  GREEN: "Generally Safe",
  YELLOW: "Ingredient List Incomplete",
};

export const TIER_LABELS: Record<IngredientTier, string> = {
  BLACK: "Completely Avoid",
  RED: "Use With Caution",
  BLUE: "Moderate Concern",
  GREEN: "Generally Safe",
};

export const TIER_ORDER: IngredientTier[] = ["BLACK", "RED", "BLUE", "GREEN"];

export function provenanceLabel(provenance: AnalyzeProductResponse["provenance"]): string {
  switch (provenance) {
    case "dom":
      return "Retailer page";
    case "ocr":
      return "Product image OCR";
    case "merged":
      return "Page + image";
    default:
      return "Analysis";
  }
}

export function sourceLabel(resultSource: AnalyzeProductResponse["resultSource"]): string {
  switch (resultSource) {
    case "cache":
      return "Cached result";
    case "fresh_pipeline":
      return "Fresh analysis";
    case "stored":
      return "Saved analysis";
    default:
      return "Analysis";
  }
}
