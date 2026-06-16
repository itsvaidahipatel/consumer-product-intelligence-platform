import { normalizeIngredientToken } from "./normalization.js";

/**
 * After "Ingredients" etc.: colon, backslash, hyphen-minus, en dash.
 * Do not spell this as `[:\\-.]` inside `[]` — `-` between `\` and `.` becomes a giant range.
 */
const ING_HEADING_PUNCT = "[:\\u005C\\u002D\\u2013]";

/** Case-insensitive heading / label hints (DOM + OCR window search). */
export const INGREDIENT_HEADING_PATTERN = new RegExp(
  `\\b(ingredients?\\s*${ING_HEADING_PUNCT}|ingredient\\s*list|contents?|composition|formulation|active\\s*ingredients?\\s*${ING_HEADING_PUNCT}|inactive\\s*ingredients?\\s*${ING_HEADING_PUNCT}|key\\s*ingredients?\\s*${ING_HEADING_PUNCT}|full\\s*ingredients?|what'?s\\s*inside|contains|made\\s*with|nutrition\\s*ingredients?|ingredient\\s*declaration|product\\s*composition)`,
  "i",
);

const INGREDIENT_HEADING_LINE_START = new RegExp(
  `^\\s*(ingredients?|ingredient\\s*list|contents?|composition|formulation|contains|made\\s*with|inci)\\s*${ING_HEADING_PUNCT}?\\s*`,
  "i",
);

const MARKETING_PATTERNS: RegExp[] = [
  /\bbest\s*seller\b/i,
  /\bclinically\s*proven\b/i,
  /\bdermatologist\s*tested\b/i,
  /\bnew\b(?=\s*\d)/i,
  /\baward\s*winning\b/i,
];

const USAGE_PATTERNS: RegExp[] = [
  /\bapply\s+(twice\s+daily|daily|morning|evening)\b/i,
  /\buse\s+(twice|daily|as\s+directed)\b/i,
  /\bdirections?\s*for\s*use\b/i,
  /\bhow\s*to\s*use\b/i,
];

const CLAIM_PATTERNS: RegExp[] = [
  /\bparaben\s*free\b/i,
  /\bcruelty\s*free\b/i,
  /\bsulfate\s*free\b/i,
  /\bvegan\b/i,
];

const PRICE_PATTERNS: RegExp[] = [/\bMRP\b/i, /₹\s*\d/, /\bRs\.?\s*\d/i, /\bINR\b/i];

const EXPIRY_PATTERNS: RegExp[] = [
  /\bbest\s*before\b/i,
  /\bexp(?:iry)?\.?\s*date\b/i,
  /\bmanufactur(?:ed|ing)\s*date\b/i,
  /\bbatch\s*(?:no\.?|number)\b/i,
];

const NUTRITION_TABLE_PATTERNS: RegExp[] = [
  /\bcalories\b/i,
  /\bprotein\b.*\bfat\b.*\bcarbohydrates?\b/i,
  /\benergy\s*\(\s*kcal/i,
  /\bserving\s*size\b/i,
];

/** Front-of-pack / Amazon marketing in Vision OCR (not an INCI declaration). */
const PACK_FRONT_OCR_PATTERNS: RegExp[] = [
  /\bnet\s*quantity\b/i,
  /\bgentle\s+skin\s+cleanser\b/i,
  /\bhydrates\s+as\s+it\s+cleanses\b/i,
  /\bdry\s+to\s+normal\b/i,
  /\bsensitive\s+skin\b/i,
  /\bcetaphil\b/i,
  /\bformula\s+\w+\s+\w+\s+gentle\b/i,
];

const INCI_SUFFIX = /\b(?:ate|ide|ol|ine|ene|anium|extrac?t|pherol|cone|mer|wax)\b/i;

/**
 * Splits a retailer ingredient blob into raw segments (before per-token normalization).
 * Separators: comma, semicolon, bullet, pipe, newline.
 * Slashes are kept — INCI uses "/" inside names (e.g. AQUA / WATER, VA/CROTONATES/… copolymer).
 */
export function splitIngredientCandidateText(text: string): string[] {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/[•·]/g, "•")
    .trim();
  if (!cleaned) return [];
  const filStripped = cleaned.replace(/\(\s*f\.?\s*i\.?\s*l\.?\s*[^)]*\)/gi, "").trim();
  const parts = filStripped
    .split(/[,;|•\n]+/g)
    .map((p) => p.replace(/\s*f\.?\s*i\.?\s*l\.?\s*z[\do]+\d*(?:\s*\/\s*\d+)?\s*$/i, "").trim())
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned];
}

/** Strip common label prefixes (case-insensitive, multiline-aware on first lines). */
export function stripIngredientLabelPrefixes(text: string): string {
  let t = text.replace(/\u00a0/g, " ");
  const lines = t.split(/\n/);
  const head = lines[0]?.replace(
    new RegExp(
      `^\\s*(ingredients?|contains|composition|contents|formulation|inci)\\s*${ING_HEADING_PUNCT}?\\s*`,
      "i",
    ),
    "",
  );
  lines[0] = head ?? "";
  t = lines.join("\n").trim();
  t = t.replace(
    new RegExp(
      `^\\s*(ingredients?|contains|composition|contents|formulation|inci)\\s*${ING_HEADING_PUNCT}?\\s*`,
      "i",
    ),
    "",
  );
  // Keep newlines so newline-separated INCI (common on Amazon) splits in tokenization.
  return t
    .split(/\n/)
    .map((ln) => ln.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Remove percentage concentrations from tokens text (keeps INCI names). */
export function stripPercentageHints(text: string): string {
  return text.replace(/\b\d+(?:\.\d+)?\s*%/g, " ").replace(/\s+/g, " ").trim();
}

export function tokensFromCandidateText(text: string): string[] {
  const stripped = stripPercentageHints(stripIngredientLabelPrefixes(text));
  return splitIngredientCandidateText(stripped)
    .map((p) => normalizeIngredientToken(p))
    .filter((t) => Boolean(t) && !/^\d+$/.test(t));
}

export type IngredientTextSource = "dom" | "ocr";

export type TextCandidate = {
  text: string;
  source: IngredientTextSource;
  /** Heuristic 0–100 before DB / completeness bonuses applied in API. */
  heuristicScore: number;
  startsWithHeading: boolean;
};

/** Amazon / retailer collapsed copy (not a real INCI block). Used for DOM penalties + OCR override. */
export function looksLikeCollapsedRetailerDom(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(see\s*less|read\s*more|won'?t\s*clog|ph\s*balanced\s*active\s*ingredients|non-?comedogenic|dermatologist\s*tested|best\s*seller|award\s*winning|clinically\s*proven)\b/i.test(
    t,
  );
}

function textHasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Heuristic score (roughly 0–100+) for one candidate block; DB and completeness layered in API.
 */
export function scoreIngredientCandidateHeuristic(args: {
  text: string;
  tokens: string[];
  source: IngredientTextSource;
}): { score: number; startsWithHeading: boolean } {
  const { text, tokens, source } = args;
  const t = text.toLowerCase();
  let score = source === "dom" ? 8 : 0;

  const startsWithHeading = INGREDIENT_HEADING_LINE_START.test(text.trim());
  if (startsWithHeading) score += 40;
  else if (INGREDIENT_HEADING_PATTERN.test(text)) score += 22;

  if (/[,;]/.test(text)) score += 20;
  if (tokens.length >= 8) score += 25;
  if (tokens.length >= 15) score += 10;
  if (tokens.length >= 30) score += 10;

  const inciHits = tokens.filter((x) => INCI_SUFFIX.test(x)).length;
  if (inciHits >= 3) score += 30;
  else if (inciHits >= 1) score += 12;

  if (/\d+(?:\.\d+)?\s*%/.test(text)) score += 5;

  if (textHasAny(text, MARKETING_PATTERNS)) score -= 50;
  if (textHasAny(text, USAGE_PATTERNS)) score -= 40;
  if (textHasAny(text, CLAIM_PATTERNS)) score -= 20;
  if (source === "dom" && looksLikeCollapsedRetailerDom(text)) score -= 70;
  if (source === "dom" && tokens.some((x) => x.length === 1)) score -= 75;
  if (tokens.length > 0 && tokens.length < 4) score -= 50;
  if (textHasAny(text, PRICE_PATTERNS)) score -= 100;
  if (textHasAny(text, EXPIRY_PATTERNS)) score -= 50;
  if (textHasAny(text, NUTRITION_TABLE_PATTERNS)) score -= 100;

  if (source === "ocr" && textHasAny(text, PACK_FRONT_OCR_PATTERNS)) {
    const hits = PACK_FRONT_OCR_PATTERNS.filter((p) => p.test(text)).length;
    score -= 40 + Math.min(60, hits * 18);
  }

  if (/\.\.\.\s*$/.test(text.trim()) || /…\s*$/.test(text.trim())) score -= 25;

  const placeholder = /see\s*packaging|refer\s*(?:to\s*)?(?:label|pack)/i;
  if (placeholder.test(t)) score -= 40;

  if (tokens.length > 0) {
    const avgLen = tokens.reduce((a, x) => a + x.length, 0) / tokens.length;
    if (avgLen > 45) score -= 25;
    if (avgLen > 70) score -= 35;
    if (avgLen > 100) score -= 45;
    const longChunks = tokens.filter((x) => x.length > 80).length;
    if (longChunks >= 2) score -= 40;
    if (longChunks >= 5) score -= 55;
  }

  if (source === "ocr" && /[,;]/.test(text) && /\bingredients?\s*:/i.test(text) && tokens.length >= 6) {
    score += 28;
  }

  return { score: Math.round(score), startsWithHeading };
}

const OCR_KEYWORD_LINE = new RegExp(
  `^\\s*(ingredients?|ingredient|contains|composition|contents|inci)\\b`,
  "i",
);

/** Match heading keyword mid-line (Vision often merges pack lines into one paragraph). */
const OCR_KEYWORD_INLINE = new RegExp(
  `\\b(ingredients?|ingredient|contains|composition|contents|inci)\\b\\s*${ING_HEADING_PUNCT}?\\s*`,
  "i",
);

/**
 * From full OCR text, extract windowed snippets around ingredient keywords (not the whole blob).
 */
export function extractOcrIngredientWindows(fullText: string, maxLinesAfter = 18): string[] {
  const lines = fullText.split(/\r?\n/);
  const out: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    const startsWithKeyword = OCR_KEYWORD_LINE.test(trimmed);
    let inlineMatch: RegExpExecArray | null = null;
    if (!startsWithKeyword) {
      OCR_KEYWORD_INLINE.lastIndex = 0;
      inlineMatch = OCR_KEYWORD_INLINE.exec(trimmed);
    }

    if (!startsWithKeyword && !inlineMatch) continue;

    let snippet: string;
    if (startsWithKeyword) {
      const windowLines = lines.slice(i, Math.min(lines.length, i + maxLinesAfter + 1));
      snippet = windowLines.join("\n").trim();
    } else {
      const from = inlineMatch!.index ?? 0;
      const restOfLine = trimmed.slice(from);
      const following = lines.slice(i + 1, Math.min(lines.length, i + 1 + maxLinesAfter));
      snippet = [restOfLine, ...following].join("\n").trim();
    }

    if (snippet.length < 24) continue;
    const key = snippet.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snippet);
  }

  if (out.length === 0 && INGREDIENT_HEADING_PATTERN.test(fullText)) {
    const idx = fullText.search(INGREDIENT_HEADING_PATTERN);
    if (idx >= 0) {
      const slice = fullText.slice(idx, idx + 3500).trim();
      if (slice.length > 40) out.push(slice);
    }
  }

  return out;
}

/** INCI-ish tokens (loose) for comma-block detection on noisy OCR. */
const INCI_LIKE_TOKEN =
  /\b(aqua|water|glycerin|glycerol|niacinamide|panthenol|phenoxyethanol|citric|sodium|potassium|magnesium|zinc|titanium|oxide|dimethicone|cyclopentasiloxane|cetearyl|stearyl|palmitate|stearate|caprylyl|propylene|butylene|disodium|edta|tocopherol|ascorbic|hyaluronic|allantoin|urea|lactic|salicylic|fragrance|parfum|limonene|linalool|benzyl|alcohol|xanthan|carbomer|cellulose|lecithin|squalane|ceramide|cholesterol|phospholipid|extract|oil|wax|butter|acid|amine|amide)\b/i;

/**
 * When Vision text has no "INGREDIENTS:" line (common on pack photos), detect dense comma-separated INCI blocks.
 */
export function extractOcrCommaInciFallback(fullText: string): string[] {
  const trimmed = fullText.replace(/\r\n/g, "\n").trim();
  if (trimmed.length < 100) return [];

  const commaCount = (trimmed.match(/,/g) ?? []).length;
  if (commaCount < 5) return [];

  const parts = trimmed
    .split(/[,;]/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length < 6) return [];

  let chemHits = 0;
  for (const p of parts) {
    if (INCI_LIKE_TOKEN.test(p)) chemHits += 1;
  }
  if (chemHits < 3) return [];

  const avgPart = trimmed.length / Math.max(1, parts.length);
  if (avgPart > 110) return [];

  return [trimmed.slice(0, 4200)];
}

function dedupeOcrSnippets(snippets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of snippets) {
    const t = s.trim();
    if (t.length < 40) continue;
    const key = t.slice(0, 140);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function extractDomIngredientCandidates(domBlob: string): string[] {
  const trimmed = domBlob.trim();
  if (!trimmed) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    const t = s.trim();
    if (t.length < 28) return;
    const k = t.slice(0, 160);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  push(trimmed);

  const paragraphs = trimmed.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  for (const p of paragraphs) {
    if (INGREDIENT_HEADING_PATTERN.test(p) || /\binci\b/i.test(p)) push(p);
  }

  const lower = trimmed.toLowerCase();
  const needles = [
    "ingredients",
    "ingredient list",
    "composition",
    "contents",
    "contains:",
    "contains",
    "formulation",
  ];

  for (const n of needles) {
    let pos = 0;
    while ((pos = lower.indexOf(n, pos)) !== -1) {
      const start = Math.max(0, pos - 40);
      const end = Math.min(trimmed.length, pos + 2200);
      push(trimmed.slice(start, end));
      pos += n.length;
    }
  }

  return out.length > 0 ? out : [trimmed];
}

export function buildScoredTextCandidates(args: {
  domRaw: string;
  /** Full OCR blob (legacy). Prefer `ocrChunks` so each image is windowed separately. */
  ocrText?: string;
  /** One string per Vision image — avoids merging hero marketing with label text before keyword windows. */
  ocrChunks?: string[];
}): TextCandidate[] {
  const results: TextCandidate[] = [];

  for (const text of extractDomIngredientCandidates(args.domRaw)) {
    const tokens = tokensFromCandidateText(text);
    const { score, startsWithHeading } = scoreIngredientCandidateHeuristic({
      text,
      tokens,
      source: "dom",
    });
    results.push({ text, source: "dom", heuristicScore: score, startsWithHeading });
  }

  const ocrChunks =
    args.ocrChunks?.filter((c) => typeof c === "string" && c.trim().length > 0) ?? [];

  const pushOcrSnippets = (snippets: string[]) => {
    for (const text of dedupeOcrSnippets(snippets)) {
      const tokens = tokensFromCandidateText(text);
      const { score, startsWithHeading } = scoreIngredientCandidateHeuristic({
        text,
        tokens,
        source: "ocr",
      });
      results.push({ text, source: "ocr", heuristicScore: score, startsWithHeading });
    }
  };

  if (ocrChunks.length > 0) {
    for (const chunk of ocrChunks) {
      const fromKeywords = extractOcrIngredientWindows(chunk);
      const fromCommas = extractOcrCommaInciFallback(chunk);
      pushOcrSnippets([...fromKeywords, ...fromCommas]);
    }

    const joined = ocrChunks.join("\n\n");
    if (joined.length >= 80) {
      const fromKeywordsJoined = extractOcrIngredientWindows(joined, 36);
      const fromCommasJoined = extractOcrCommaInciFallback(joined);
      pushOcrSnippets([...fromKeywordsJoined, ...fromCommasJoined]);
    }
  } else if (args.ocrText?.trim()) {
    const fromKeywords = extractOcrIngredientWindows(args.ocrText);
    const fromCommas = extractOcrCommaInciFallback(args.ocrText);
    for (const text of dedupeOcrSnippets([...fromKeywords, ...fromCommas])) {
      const tokens = tokensFromCandidateText(text);
      const { score, startsWithHeading } = scoreIngredientCandidateHeuristic({
        text,
        tokens,
        source: "ocr",
      });
      results.push({ text, source: "ocr", heuristicScore: score, startsWithHeading });
    }
  }

  return results;
}

/**
 * Prioritize gallery images for label / back-of-pack OCR (extension + API).
 * Tuned for Amazon `media-amazon.com/images/I/` URLs and short marketing alts.
 */
export function scoreProductImageForIngredients(url: string, alt?: string): number {
  const hay = `${url} ${alt ?? ""}`.toLowerCase();
  const altLower = (alt ?? "").toLowerCase();
  let s = 0;

  if (
    /ingredient|nutrition|supplement|facts|composition|contents|label|back|inci|pack|carton|fact\s*table|warnings?/.test(
      hay,
    )
  ) {
    s += 110;
  }

  if (/media-amazon\.com\/images\/i\//i.test(url)) {
    const dimMatch = url.match(/\._AC_([A-Z]{2,3})(\d{2,4})_/i);
    if (dimMatch) {
      const dim = parseInt(dimMatch[2], 10);
      if (dim >= 900 && dim <= 2200) s += 28;
      if (dim >= 1200) s += 12;
      if (dim <= 200) s -= 40;
    }
    if (/pack|ingredient|label|back|zoom|spec|chart|diagram|supplement|nutrition/i.test(hay)) s += 38;
    if (/_sx\d{1,2}_|_ac_us\d{1,2}_|_ul\d{1,2}_|_ss\d{1,2}_/i.test(url)) s -= 50;
  }

  if (/\b(model|woman|man|face|applying|splash|before\s*and\s*after|texture\s*shot)\b/i.test(altLower)) {
    s -= 130;
  }
  if (/\b(new\s*look|best\s*seller|award|limited\s*edition)\b/i.test(altLower)) s -= 55;
  if (/\b(gel|cream|cleanser|lotion|serum)\s*(swatch|texture)\b/i.test(altLower)) s -= 75;

  if (/hero|lifestyle|model|banner|logo|face|portrait|swatches?/i.test(hay)) s -= 90;
  if (/main|primary|landing|white\s*bg|packshot\s*front|hero\s*image/i.test(hay)) s -= 42;

  if (
    altLower.length > 0 &&
    altLower.length < 36 &&
    !/ingredient|label|back|pack|nutrition|composition|inci|contents|facts/i.test(altLower)
  ) {
    s -= 22;
  }

  return s;
}
