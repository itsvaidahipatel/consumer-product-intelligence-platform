import type { IngredientTier, ProductClassification } from "@ingredient-scanner/shared";

export type ProductBanner = {
  classification: ProductClassification;
  label: string;
  subtitle: string;
};

/**
 * Worst-tier wins; incomplete lists force YELLOW per product spec.
 */
export function classifyProduct(completenessFlag: boolean, tiers: IngredientTier[]): ProductBanner {
  if (!completenessFlag) {
    return {
      classification: "YELLOW",
      label: "YELLOW FLAG PRODUCT",
      subtitle: "Ingredient List Incomplete",
    };
  }

  if (tiers.includes("BLACK")) {
    return {
      classification: "BLACK",
      label: "BLACK FLAG PRODUCT",
      subtitle: "Completely Avoid",
    };
  }
  if (tiers.includes("RED")) {
    return {
      classification: "RED",
      label: "RED FLAG PRODUCT",
      subtitle: "Use With Caution",
    };
  }
  if (tiers.includes("BLUE")) {
    return {
      classification: "BLUE",
      label: "BLUE FLAG PRODUCT",
      subtitle: "Moderate Concern",
    };
  }

  return {
    classification: "GREEN",
    label: "GREEN FLAG PRODUCT",
    subtitle: "Generally Safe",
  };
}

/** Label copy for a persisted product classification (cache replay without re-deriving tiers). */
export function labelsForProductClassification(
  classification: ProductClassification,
): Pick<ProductBanner, "label" | "subtitle"> {
  switch (classification) {
    case "YELLOW":
      return { label: "YELLOW FLAG PRODUCT", subtitle: "Ingredient List Incomplete" };
    case "BLACK":
      return { label: "BLACK FLAG PRODUCT", subtitle: "Completely Avoid" };
    case "RED":
      return { label: "RED FLAG PRODUCT", subtitle: "Use With Caution" };
    case "BLUE":
      return { label: "BLUE FLAG PRODUCT", subtitle: "Moderate Concern" };
    case "GREEN":
      return { label: "GREEN FLAG PRODUCT", subtitle: "Generally Safe" };
  }
}
