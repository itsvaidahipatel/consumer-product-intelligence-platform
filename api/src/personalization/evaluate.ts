import type { AnalyzeProductResponse, UserPreferences } from "@ingredient-scanner/shared";

const FRAGRANCE_KEYS = new Set([
  "parfum",
  "fragrance",
  "linalool",
  "limonene",
  "citronellol",
  "hexyl cinnamal",
  "benzyl salicylate",
  "alpha-isomethyl ionone",
]);

const NUT_KEYS = new Set(["peanut", "almond", "hazelnut", "walnut", "cashew", "macadamia"]);

export function applyPersonalization(
  response: AnalyzeProductResponse,
  prefs?: UserPreferences,
): AnalyzeProductResponse {
  if (!prefs) {
    return {
      ...response,
      generalRisk: response.generalRisk,
      personalizedRisk: response.generalRisk,
      personalizationReasons: [],
    };
  }

  const reasons: string[] = [];
  let elevated = false;

  for (const ing of response.ingredients) {
    const n = ing.normalizedName.toLowerCase();
    if (prefs.fragranceSensitivity && [...FRAGRANCE_KEYS].some((k) => n.includes(k))) {
      reasons.push(`Fragrance sensitivity: ${ing.name} is a fragrance-related ingredient.`);
      elevated = true;
    }
    if (prefs.nutAllergy && [...NUT_KEYS].some((k) => n.includes(k))) {
      reasons.push(`Nut allergy profile: ${ing.name} may be nut-derived or cross-reactive.`);
      elevated = true;
    }
    if (prefs.vegan && /\b(lanolin|beeswax|honey|carmine|collagen)\b/i.test(n)) {
      reasons.push(`Vegan preference: ${ing.name} is often animal-derived.`);
      elevated = true;
    }
    if (prefs.pregnancy && /\b(retinol|retinyl|salicylic acid|hydroquinone)\b/i.test(n)) {
      reasons.push(`Pregnancy profile: ${ing.name} may warrant extra caution.`);
      elevated = true;
    }
    if (prefs.sensitiveSkin && ing.tier === "RED") {
      reasons.push(`Sensitive skin: ${ing.name} is flagged higher concern.`);
      elevated = true;
    }
  }

  const general = response.generalRisk ?? "MEDIUM";
  let personalized = general;
  if (elevated) {
    if (general === "LOW") personalized = "MEDIUM";
    else if (general === "MEDIUM") personalized = "HIGH";
    else personalized = "SEVERE";
  }

  return {
    ...response,
    generalRisk: general,
    personalizedRisk: personalized,
    personalizationReasons: reasons.length ? reasons : undefined,
  };
}
