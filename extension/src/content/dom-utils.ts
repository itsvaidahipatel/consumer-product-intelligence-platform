import { sanitizeDomIngredientBlob, scoreProductImageForIngredients } from "@ingredient-scanner/shared";

const NOISE_PREFIXES = [/^ingredients?:/i, /^inci:?/i, /^composition:?/i];

export function stripRetailerNoise(text: string): string {
  let t = text.replace(/\u00a0/g, " ");
  for (const p of NOISE_PREFIXES) {
    t = t.replace(p, "");
  }
  // Preserve newlines so each INCI line becomes its own token downstream.
  return t
    .split(/\n/)
    .map((ln) => ln.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * True if activating this element would follow a real link (e.g. Sign in, View more → /ap/signin).
 * We must not call .click() on these — Amazon often wraps marketing copy in <a href="...">.
 */
function clickingWouldFollowLink(el: HTMLElement): boolean {
  const anchor = el.closest("a");
  if (!anchor) return false;
  const href = anchor.getAttribute("href")?.trim() ?? "";
  if (!href || href === "#") return false;
  if (href.startsWith("#")) return false;
  if (/^javascript:/i.test(href)) return false;
  return true;
}

const EXPAND_LABEL = /see more|read more|view more|show more|view ingredients/i;

/** Selectors too broad to use as an expansion subtree (would scan the whole page). */
function isReasonableExpandScope(selector: string): boolean {
  const s = selector.trim().toLowerCase();
  return s.length > 0 && s !== "div" && s !== "section";
}

/**
 * Best-effort expansion of lazy-loaded / collapsed retailer UI.
 * Only clicks controls that are not inside navigational links (avoids sending users to sign-in, etc.).
 * When `scopeSelectors` is set (e.g. product detail regions), search is limited to those subtrees.
 */
export function expandCollapsedSections(
  root: ParentNode = document,
  scopeSelectors?: readonly string[],
): void {
  const scopes: HTMLElement[] = [];
  if (scopeSelectors?.length) {
    for (const sel of scopeSelectors) {
      if (!isReasonableExpandScope(sel)) continue;
      for (const node of Array.from(document.querySelectorAll(sel))) {
        if (node instanceof HTMLElement) scopes.push(node);
      }
    }
  }

  const searchRoots: HTMLElement[] =
    scopes.length > 0 ? scopes : [root instanceof HTMLElement ? root : document.body];

  const candidates: HTMLElement[] = [];
  for (const subRoot of searchRoots) {
    // Prefer real controls; spans are often inside <a> on retailers (dangerous to click).
    const found = Array.from(
      subRoot.querySelectorAll<HTMLElement>(
        "button, input[type='button'], [role='button']:not(a), span",
      ),
    ).filter((el) => EXPAND_LABEL.test(el.innerText) && !clickingWouldFollowLink(el));
    candidates.push(...found);
  }

  const deduped = [...new Set(candidates)];

  for (const el of deduped.slice(0, 12)) {
    try {
      el.click();
    } catch {
      /* ignore */
    }
  }
}

export function pickFirstText(selectors: readonly string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return "";
}

export type GalleryImageEntry = { url: string; alt?: string };

function amazonImageDedupKey(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\._[A-Z0-9._-]+_\./gi, ".");
  } catch {
    return url;
  }
}

/** Parse Amazon `data-a-dynamic-image` JSON map of hi-res URLs → dimensions. */
export function parseAmazonDynamicImageUrls(attr: string | null | undefined): string[] {
  if (!attr?.trim()) return [];
  const cleaned = attr.replace(/&quot;/g, '"').replace(/&#34;/g, '"');
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    return Object.keys(obj).filter((k) => typeof k === "string" && k.startsWith("http"));
  } catch {
    return [];
  }
}

/**
 * Amazon.in: collect thumbnail strip + `data-a-dynamic-image` variants, then rank for label/back OCR.
 * Hero `#landingImage` alone is often marketing; thumbnails frequently include carton back / zoom.
 */
export function collectAmazonIndiaGalleryImages(limit: number): GalleryImageEntry[] {
  const seen = new Set<string>();
  const rough: GalleryImageEntry[] = [];

  const add = (url: string, alt?: string) => {
    const u = (url || "").trim();
    if (!u || u.startsWith("data:")) return;
    const key = amazonImageDedupKey(u);
    if (seen.has(key)) return;
    seen.add(key);
    const a = alt?.trim() || undefined;
    rough.push({ url: u, alt: a });
  };

  const thumbSelectors = [
    "#altImages ul li.image img",
    "#altImages li.item.image img",
    "#altImages li img",
    "#altImages .list-item img",
    "#imageBlock_feature_div #altImages img",
    "#imageBlock_feature_div li.image img",
  ];

  for (const sel of thumbSelectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      add(
        img.currentSrc || img.src,
        img.alt || img.getAttribute("aria-label") || undefined,
      );
    }
  }

  const dynamicRoots = document.querySelectorAll<HTMLImageElement>(
    "#landingImage, #imgTagWrapperId img, #main-image, #imageBlock_feature_div #landingImage",
  );
  for (const img of Array.from(dynamicRoots)) {
    const alt = img.alt?.trim() || img.getAttribute("aria-label")?.trim() || undefined;
    for (const u of parseAmazonDynamicImageUrls(img.getAttribute("data-a-dynamic-image"))) {
      add(u, alt);
    }
    add(img.currentSrc || img.src, alt);
  }

  rough.sort(
    (a, b) => scoreProductImageForIngredients(b.url, b.alt) - scoreProductImageForIngredients(a.url, a.alt),
  );
  return rough.slice(0, limit);
}

/** Collect product images with alt text for downstream URL prioritization (label / back pack). */
export function collectGalleryImagesWithMeta(
  selectors: readonly string[],
  limit: number,
): GalleryImageEntry[] {
  const seen = new Set<string>();
  const out: GalleryImageEntry[] = [];
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(`${sel}`))) {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:")) continue;
      if (seen.has(src)) continue;
      seen.add(src);
      const alt = img.alt?.trim() || img.getAttribute("aria-label")?.trim() || undefined;
      out.push({ url: src, alt });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const INGREDIENTISH =
  /ingredient|inci|composition|contents?|formulation|formula|contains|made\s*with|declaration|nutrition\s*ingredients?/i;

export function findIngredientishText(selectors: readonly string[]): string {
  const chunks: string[] = [];
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!text || text.length > 6000) continue;
      if (INGREDIENTISH.test(text) && text.length > 40) {
        chunks.push(text);
      }
    }
  }

  if (chunks.length === 0) {
    const body = document.body.innerText ?? "";
    const punct = "[:\\u005C\\u002D\\u2013]";
    const patterns = [
      new RegExp(`ingredients?\\s*${punct}?\\s*([\\s\\S]{40,1200})`, "i"),
      new RegExp(`composition\\s*${punct}?\\s*([\\s\\S]{40,1200})`, "i"),
      new RegExp(`contents?\\s*${punct}?\\s*([\\s\\S]{40,1200})`, "i"),
      new RegExp(`contains\\s*${punct}?\\s*([\\s\\S]{40,1200})`, "i"),
    ];
    for (const re of patterns) {
      const match = body.match(re);
      if (match?.[1]) {
        chunks.push(match[1].trim());
        break;
      }
    }
  }

  return stripRetailerNoise(sanitizeDomIngredientBlob(chunks.join(" \n ")));
}
