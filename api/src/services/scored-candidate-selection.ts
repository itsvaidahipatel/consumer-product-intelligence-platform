import {
  buildScoredTextCandidates,
  looksLikeCollapsedRetailerDom,
  tokensFromCandidateText,
  type IngredientTextSource,
} from "@ingredient-scanner/shared";
import { evaluateIngredientCompleteness } from "./completeness.js";
import { resolveCanonicalTokenHits } from "./canonical-token-hits.js";
import type { Db } from "../db/client.js";

export type SourcePick = {
  source: "dom" | "ocr" | "merged";
  winningReasonCode: string;
  tokens: string[];
  confidence: number;
  /** Winning ingredient list text (for completeness + persistence context). */
  winningRawText: string;
};

function commaCount(text: string): number {
  return (text.match(/,/g) ?? []).length;
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dbBonus(dbHitCount: number, tokenCount: number): number {
  if (tokenCount === 0) return 0;
  if (dbHitCount >= 10) return 50;
  return Math.min(45, Math.floor((dbHitCount / Math.max(1, tokenCount)) * 40));
}

function completenessBonus(tokens: string[], text: string, dbHitRatio: number): number {
  let b = 0;
  if (tokens.length >= 8) b += 20;
  if (tokens.length >= 15) b += 10;
  if (tokens.length >= 30) b += 10;
  if (dbHitRatio >= 0.5) b += 30;
  else if (dbHitRatio >= 0.25) b += 15;
  if (!/\.\.\.\s*$|…\s*$/m.test(text.trim())) b += 15;
  const lower = text.toLowerCase();
  if (!/see\s*packaging|refer\s*(?:to\s*)?label/i.test(lower)) b += 15;
  return b;
}

type Scored = {
  text: string;
  source: IngredientTextSource;
  tokens: string[];
  dbHits: number;
  score: number;
};

/**
 * Enumerates DOM (+ optional OCR) text candidates, scores with heuristics + encyclopedia hits,
 * and returns the best list (with optional high-similarity merge).
 */
export async function selectWinningIngredientCandidate(args: {
  db: Db;
  domRaw: string;
  ocrText?: string;
  ocrChunks?: string[];
  ocrMeanConfidence?: number;
}): Promise<SourcePick> {
  const { db, domRaw, ocrText, ocrChunks, ocrMeanConfidence } = args;

  const candidates = buildScoredTextCandidates({
    domRaw,
    ocrText: ocrChunks?.length ? undefined : ocrText,
    ocrChunks,
  });
  if (candidates.length === 0) {
    return {
      source: "dom",
      winningReasonCode: "empty_dom",
      tokens: [],
      confidence: 0,
      winningRawText: "",
    };
  }

  const allTokens = [...new Set(candidates.flatMap((c) => tokensFromCandidateText(c.text)))];
  const hitSet = await resolveCanonicalTokenHits(db, allTokens);

  const scored: Scored[] = candidates.map((c) => {
    const tokens = tokensFromCandidateText(c.text);
    const heuristic = c.heuristicScore;
    const dbHits = tokens.filter((t) => hitSet.has(t)).length;
    const dbRatio = tokens.length ? dbHits / tokens.length : 0;
    const cBonus = completenessBonus(tokens, c.text, dbRatio);
    let score = heuristic + dbBonus(dbHits, tokens.length) + cBonus;
    if (c.source === "ocr" && typeof ocrMeanConfidence === "number") {
      score += Math.round(ocrMeanConfidence * 20);
    }
    return { text: c.text, source: c.source, tokens, dbHits, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  if (!top || top.tokens.length === 0) {
    const fallback = domRaw.trim();
    const tokens = tokensFromCandidateText(fallback);
    return {
      source: "dom",
      winningReasonCode: "dom_fallback",
      tokens,
      confidence: 0.35,
      winningRawText: fallback,
    };
  }

  if (
    second &&
    top.source !== second.source &&
    jaccard(top.tokens, second.tokens) > 0.38 &&
    Math.abs(top.score - second.score) < 18
  ) {
    const merged = [...top.tokens];
    for (const t of second.tokens) if (!merged.includes(t)) merged.push(t);
    const conf = Math.min(1, 0.45 + merged.length * 0.012 + jaccard(top.tokens, second.tokens) * 0.15);
    return {
      source: "merged",
      winningReasonCode: "scored_merge_similar_lists",
      tokens: merged,
      confidence: conf,
      winningRawText: `${top.text}\n---\n${second.text}`,
    };
  }

  let winner = top;
  let winReason = winner.source === "dom" ? "scored_dom_winner" : "scored_ocr_winner";

  const MIN_DOM_LIST = 8;
  if (ocrChunks && ocrChunks.length > 0 && winner.source === "dom" && winner.tokens.length < MIN_DOM_LIST) {
    const ocrs = scored.filter((s) => s.source === "ocr");
    const byQuality = [...ocrs].sort((a, b) => {
      const d = b.tokens.length - a.tokens.length;
      if (d !== 0) return d;
      return b.text.length - a.text.length;
    });
    const bestOcr = byQuality[0];
    if (bestOcr) {
      const domNoise =
        looksLikeCollapsedRetailerDom(winner.text) || winner.tokens.some((t) => t.length === 1);
      const ocrCommaRich =
        commaCount(bestOcr.text) >= commaCount(winner.text) + 4 && bestOcr.tokens.length >= winner.tokens.length;
      const ocrClearlyLonger =
        bestOcr.tokens.length > winner.tokens.length ||
        (bestOcr.tokens.length >= winner.tokens.length &&
          bestOcr.text.length >= Math.max(160, winner.text.length + 80));
      if (ocrClearlyLonger || (domNoise && bestOcr.text.length >= 100 && bestOcr.tokens.length >= winner.tokens.length) || ocrCommaRich) {
        winner = bestOcr;
        winReason = "scored_ocr_over_short_dom";
      }
    }
  }

  const conf = Math.min(1, 0.35 + winner.score / 220 + (winner.dbHits > 0 ? 0.12 : 0));
  return {
    source: winner.source,
    winningReasonCode: winReason,
    tokens: winner.tokens,
    confidence: conf,
    winningRawText: winner.text,
  };
}

/**
 * Best DOM-only pick + completeness (for Vision gating before OCR exists).
 */
export async function selectDomOnlyForVisionGate(args: {
  db: Db;
  domRaw: string;
}): Promise<{ pick: SourcePick; completeness: ReturnType<typeof evaluateIngredientCompleteness> }> {
  const pick = await selectWinningIngredientCandidate({
    db: args.db,
    domRaw: args.domRaw,
    ocrText: undefined,
    ocrMeanConfidence: undefined,
  });
  const text =
    pick.tokens.length > 0
      ? `${pick.winningRawText.trim()}\n${pick.tokens.join(", ")}`.trim()
      : pick.winningRawText || args.domRaw;
  const completeness = evaluateIngredientCompleteness(text, pick.tokens);
  return { pick, completeness };
}
