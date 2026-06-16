import type { ProductClassification } from "@ingredient-scanner/shared";

export function classificationToGeneralRisk(
  c: ProductClassification,
): "LOW" | "MEDIUM" | "HIGH" | "SEVERE" {
  if (c === "GREEN") return "LOW";
  if (c === "BLUE" || c === "YELLOW") return "MEDIUM";
  if (c === "RED") return "HIGH";
  return "SEVERE";
}
