/**
 * Retailer DOM often concatenates safety blurbs, INCI, directions, A+ tables, and even
 * inline script/CSS. Clip to the declaration block and drop obvious non-ingredient lines.
 */

/** Hard chop when Amazon / AUI bleeds script or style text into the same subtree. */
const PAGE_BLEED_MARKERS: RegExp[] = [
  /\.po-break-word\b/i,
  /#po-tta-action\b/i,
  /\bfunction\s+logtech/i,
  /\bmetricparameters\b/i,
  /\btypeof\s+window[./]/i,
  /\bttaevents\b/i,
  /\bnexusschemaid\b/i,
  /\bobfuscatedmarketplaceid\b/i,
  /\blogshoppablemetrics\b/i,
  /\.aplus-v2\b/i,
  /\bpadding-right\s*:/i,
  /\bmodule-\d+\b/i,
];

/** Start of non-INCI sections that commonly follow a cosmetic INCI list on Amazon.in. */
const POST_INCI_SECTION_MARKERS: RegExp[] = [
  /\bdirections?\s*[:\u005C\u002D\u2013]/i,
  /\bdirections?\s+for\s+use\b/i,
  /\bhow\s+to\s+use\b/i,
  /\bhow\s+to\s+apply\b/i,
  /\b(?:warnings?|caution)\s*[:\u005C\u002D\u2013]/i,
  /\bstorage\s*[:\u005C\u002D\u2013]/i,
  /\bfor\s+external\s+use\s+only\b/i,
  /\bsee\s+less\b/i,
  /\btarget\s+audience\b/i,
  /\bitem\s+weight\b/i,
  /\bitem\s+dimensions\b/i,
  /\bproduct\s+benefits\b/i,
  /\bspecial\s+feature\b/i,
  /\bage\s+range\s+description\b/i,
  /\bkey\s+ingredients?\s*[:\u005C\u002D\u2013]/i,
  /\bskin\s+type\b/i,
  /\bfoaming\s+(?:texture|facial|gel)\b/i,
  /\bdeveloped\s+with\s+dermatologists\b/i,
  /\bproduct\s+description\b/i,
  /\bcustomer\s+reviews\b/i,
  /\bprice\b/i,
  /\bno\s+data\b/i,
  /\bbenefits?\s+cleanses\b/i,
  /\bhydrates?\s*&\s*helps\b/i,
  /\bprotective\s+skin\s+barrier\b/i,
  /\bgently\s+removes\b/i,
  /\bit\s+gently\b/i,
];

function hardChopBleed(s: string): string {
  let min = -1;
  for (const re of PAGE_BLEED_MARKERS) {
    const i = s.search(re);
    if (i >= 0 && (min < 0 || i < min)) min = i;
  }
  return min >= 0 ? s.slice(0, min).trim() : s;
}

function lastIngredientsLabelEnd(text: string): number {
  let end = -1;
  // Standalone INCI label — skip marketing phrases like "key ingredients" / "active ingredients".
  const re = /(?<!(?:key|active)\s)\bingredients\s*[:\u005C\u002D\u2013]\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    end = m.index + m[0].length;
  }
  return end;
}

function earliestPostInciCut(body: string): number {
  let end = body.length;
  for (const re of POST_INCI_SECTION_MARKERS) {
    const i = body.search(re);
    if (i >= 0 && i < end) end = i;
  }
  return end;
}

function isGarbageDomLine(line: string): boolean {
  const s = line.trim().toLowerCase();
  if (s.length < 6) return false;
  if (/^[#.][\w.-]+\s*[{:]/.test(s) && /word-break|padding|truncate|break-word/.test(s)) return true;
  if (/\bword-break\s*:|padding\s*:\s*\d|@media\b/.test(s)) return true;
  if (/\bfunction\s+\w+\s*\(|\bvar\s+\w+\s*=|\blet\s+\w+\s*=/.test(s)) return true;
  if (
    /\bmetricparameters\b|\bnexusschemaid\b|\bttaevents\b|\bproducerid\s*:/.test(s) ||
    /\bobfuscatedmarketplaceid\b/.test(s)
  ) {
    return true;
  }
  if (/^\s*typeof\s+window/.test(s)) return true;
  if (/^\s*ent:\s*['"]all['"]\s*$/.test(s)) return true;
  if (/\blogshoppablemetrics\b|\.aplus-|padding-right\s*:|word-break\s*:/.test(s)) return true;
  if (/\b(?:cleanses|hydrates|moisturising|non-comedogenic|fragrance-free)\b/.test(s) && !/,/.test(s)) {
    return true;
  }
  if (/\b(?:benefits?|barrier|restores?|developed\s+with)\b/.test(s) && !/,/.test(s)) return true;
  if (/^\d+\s*[-.)]\s*\w+/.test(s)) return true;
  if (/\s&\shelps\b/.test(s)) return true;
  return false;
}

/**
 * Returns a shorter string focused on the INCI-style list when the DOM is noisy.
 * Safe to run on OCR too (usually no-op if no `Ingredients:` label).
 */
export function sanitizeDomIngredientBlob(text: string): string {
  let t = (text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";

  t = hardChopBleed(t);

  const start = lastIngredientsLabelEnd(t);
  let body = start >= 0 ? t.slice(start) : t;

  body = body.slice(0, earliestPostInciCut(body)).trim();

  const lines = body.split(/\n/);
  const kept = lines
    .map((ln) => ln.replace(/[ \t]+/g, " ").trim())
    .filter((ln) => ln.length > 0 && !isGarbageDomLine(ln));

  body = kept.join("\n").trim();

  if (!body) {
    const fallback = hardChopBleed(t);
    return fallback.slice(0, Math.min(2800, fallback.length)).trim();
  }

  return body.length > 8000 ? body.slice(0, 8000).trim() : body;
}
