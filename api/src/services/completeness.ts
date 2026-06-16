export type CompletenessEvaluation = {
  completenessFlag: boolean;
  confidenceScore: number;
  issues: string[];
};

const MIN_INGREDIENTS = 8;
const CONFIDENCE_THRESHOLD = 0.72;

const PLACEHOLDER_PHRASES = [
  "see packaging",
  "refer to label",
  "refer packaging",
  "ingredients as printed on pack",
];

const OCR_TRUNCATION_MARKERS = ["[ocr truncated]", "ocr truncated"];

/**
 * V1 completeness heuristics from product spec.
 * `completenessFlag` is true only when all required rules pass and confidence clears threshold.
 */
export function evaluateIngredientCompleteness(
  rawIngredientText: string,
  tokens: string[],
): CompletenessEvaluation {
  const text = rawIngredientText.trim();
  const lower = text.toLowerCase();
  const issues: string[] = [];

  if (tokens.length < MIN_INGREDIENTS) {
    issues.push("below_minimum_ingredient_count");
  }

  if (text.endsWith("...") || /\.\.\.\s*$/.test(text)) {
    issues.push("trailing_ellipsis");
  }

  for (const phrase of PLACEHOLDER_PHRASES) {
    if (lower.includes(phrase)) {
      issues.push(`placeholder:${phrase.replace(/\s+/g, "_")}`);
    }
  }

  for (const marker of OCR_TRUNCATION_MARKERS) {
    if (lower.includes(marker)) {
      issues.push("ocr_truncation_marker");
    }
  }

  if (lower.includes("see more") && tokens.length < 12) {
    issues.push("possible_lazy_truncation");
  }

  let confidence = 0.55;

  confidence += Math.min(0.35, tokens.length * 0.012);

  /** Newline / bullet INCI often has no commas in the raw blob; token count still signals a structured list. */
  if (tokens.length >= MIN_INGREDIENTS) {
    confidence += 0.08;
  }

  if (/[,;]/.test(text)) {
    confidence += 0.06;
  }

  if (/\b(ate|ide|ol|ine|ene|anium)\b/i.test(text)) {
    confidence += 0.05;
  }

  confidence -= issues.length * 0.08;
  confidence = Math.max(0, Math.min(1, confidence));

  const completenessFlag =
    issues.length === 0 && tokens.length >= MIN_INGREDIENTS && confidence >= CONFIDENCE_THRESHOLD;

  return { completenessFlag, confidenceScore: confidence, issues };
}
