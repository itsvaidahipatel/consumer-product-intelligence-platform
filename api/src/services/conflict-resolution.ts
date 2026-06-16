import {
  normalizeIngredientToken,
  splitIngredientBlob,
  type WinningReasonCode,
} from "@ingredient-scanner/shared";

export type SourcePick = {
  source: "dom" | "ocr" | "merged";
  winningReasonCode: WinningReasonCode | string;
  tokens: string[];
  confidence: number;
};

function tokenize(text: string): string[] {
  return splitIngredientBlob(text).map((t) => normalizeIngredientToken(t)).filter(Boolean);
}

function scoreTokens(tokens: string[], ocrConfidence?: number): number {
  let score = 0.4 + Math.min(0.35, tokens.length * 0.015);
  if (tokens.length >= 8) score += 0.1;
  if (tokens.some((t) => /(ate|ide|ol|ine)$/i.test(t))) score += 0.05;
  if (typeof ocrConfidence === "number") {
    score += ocrConfidence * 0.25;
  }
  return Math.max(0, Math.min(1, score));
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Resolves DOM vs OCR ingredient lists using confidence heuristics from the spec.
 */
export function resolveDomVsOcr(args: {
  domText: string;
  ocrText?: string;
  ocrMeanConfidence?: number;
  domCompletenessFlag: boolean;
  ocrCompletenessFlag: boolean;
}): SourcePick {
  const domTokens = tokenize(args.domText);
  const ocrTokens = args.ocrText ? tokenize(args.ocrText) : [];

  if (!args.ocrText || ocrTokens.length === 0) {
    return {
      source: "dom",
      winningReasonCode: "dom_higher_confidence",
      tokens: domTokens,
      confidence: scoreTokens(domTokens),
    };
  }

  const domScore = scoreTokens(domTokens);
  const ocrScore = scoreTokens(ocrTokens, args.ocrMeanConfidence);

  if (args.domCompletenessFlag && !args.ocrCompletenessFlag) {
    return {
      source: "dom",
      winningReasonCode: "dom_complete_ocr_incomplete",
      tokens: domTokens,
      confidence: domScore,
    };
  }

  if (args.ocrCompletenessFlag && !args.domCompletenessFlag) {
    return {
      source: "ocr",
      winningReasonCode: "ocr_complete_dom_incomplete",
      tokens: ocrTokens,
      confidence: ocrScore,
    };
  }

  const similarity = jaccard(domTokens, ocrTokens);

  if (Math.abs(domScore - ocrScore) < 0.03 && similarity > 0.35) {
    const merged = [...domTokens];
    for (const t of ocrTokens) if (!merged.includes(t)) merged.push(t);
    const mergedScore = (domScore + ocrScore) / 2 + similarity * 0.05;
    return {
      source: "merged",
      winningReasonCode: "merged_union",
      tokens: merged,
      confidence: Math.min(1, mergedScore),
    };
  }

  if (domScore >= ocrScore) {
    return {
      source: "dom",
      winningReasonCode: "dom_higher_confidence",
      tokens: domTokens,
      confidence: domScore,
    };
  }

  return {
    source: "ocr",
    winningReasonCode: "ocr_higher_confidence",
    tokens: ocrTokens,
    confidence: ocrScore,
  };
}
