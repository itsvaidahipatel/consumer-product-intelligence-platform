import type { IngredientTier, ProductFlag } from "./classification.js";
import { escapeHtml } from "./escape.js";

export function primaryButton(label: string, attrs: Record<string, string> = {}): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
    .join(" ");
  return `<button type="button" class="btn btn--primary" ${attrStr}>${escapeHtml(label)}</button>`;
}

export function secondaryButton(label: string, attrs: Record<string, string> = {}): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
    .join(" ");
  return `<button type="button" class="btn btn--secondary" ${attrStr}>${escapeHtml(label)}</button>`;
}

export function iconButton(label: string, attrs: Record<string, string> = {}): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
    .join(" ");
  return `<button type="button" class="btn btn--icon" aria-label="${escapeHtml(label)}" ${attrStr}>×</button>`;
}

export function flagBadge(flag: ProductFlag, text: string): string {
  return `<span class="flag flag--${flag.toLowerCase()}" role="status">${escapeHtml(text)}</span>`;
}

export function legendDot(tier: IngredientTier, label: string): string {
  return `<span class="legend-item"><span class="legend-dot legend-dot--${tier.toLowerCase()}" aria-hidden="true"></span><span class="legend-label">${escapeHtml(label)}</span></span>`;
}

export function ingredientChip(name: string, tier: IngredientTier): string {
  return `<span class="chip chip--${tier.toLowerCase()}">${escapeHtml(name)}</span>`;
}

export function accordionSection(args: {
  id: string;
  title: string;
  tier: IngredientTier;
  bodyHtml: string;
  expanded?: boolean;
}): string {
  const expanded = args.expanded ?? false;
  return `<section class="accordion">
    <h3>
      <button
        type="button"
        class="accordion__trigger"
        id="${escapeHtml(args.id)}-trigger"
        aria-expanded="${expanded ? "true" : "false"}"
        aria-controls="${escapeHtml(args.id)}-panel"
      >
        <span class="legend-dot legend-dot--${args.tier.toLowerCase()}" aria-hidden="true"></span>
        <span class="accordion__title">${escapeHtml(args.title)}</span>
        <span class="accordion__chevron" aria-hidden="true"></span>
      </button>
    </h3>
    <div
      class="accordion__panel"
      id="${escapeHtml(args.id)}-panel"
      role="region"
      aria-labelledby="${escapeHtml(args.id)}-trigger"
      ${expanded ? "" : "hidden"}
    >
      ${args.bodyHtml}
    </div>
  </section>`;
}
