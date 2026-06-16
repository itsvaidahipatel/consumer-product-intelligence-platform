/**
 * Normalizes a single ingredient token for dictionary lookup.
 * Keeps logic deterministic and extension/API aligned.
 */
export function normalizeIngredientToken(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/[()[\]{}]/g, " ");
  s = s.replace(/[,;]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\.+$/, "").trim();
  return s;
}

/**
 * Lookup keys for encyclopedia matching.
 * Handles INCI slash aliases (`aqua / water`) without splitting polymer slashes (`VA/CROTONATES/…`).
 */
export function expandIngredientLookupKeys(raw: string): string[] {
  const keys = new Set<string>();
  const push = (value: string) => {
    const norm = normalizeIngredientToken(value);
    if (norm) keys.add(norm);
  };

  push(raw);
  const spaced = raw.trim().toLowerCase().replace(/\.+$/, "").trim();
  for (const part of spaced.split(/\s+\/\s+/)) {
    push(part);
  }
  return [...keys];
}

/**
 * Splits retailer ingredient blobs into raw tokens (pre-normalization).
 * Primary separators are commas and semicolons (typical INCI listings).
 */
export function splitIngredientBlob(text: string): string[] {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const parts = cleaned
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [cleaned];
}
