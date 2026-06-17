import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";
import tokensCss from "./tokens.css?inline";
import componentsCss from "./components.css?inline";
import cardCss from "./results-card.css?inline";
import { escapeHtml } from "./escape.js";
import {
  FLAG_LABELS,
  TIER_LABELS,
  TIER_ORDER,
  provenanceLabel,
  sourceLabel,
  type IngredientTier,
  type ProductFlag,
} from "./classification.js";
import {
  accordionSection,
  flagBadge,
  ingredientChip,
  iconButton,
} from "./components.js";

const HOST_ID = "ingredient-scanner-results-host";

const FLAG_HINTS: Record<ProductFlag, string> = {
  BLACK: "Contains ingredients we recommend avoiding.",
  RED: "Several ingredients may need extra caution.",
  BLUE: "Some ingredients warrant a closer look.",
  GREEN: "No major concerns stood out in this list.",
  YELLOW: "The ingredient list may be incomplete — check the pack.",
};

function cleanSummary(text: string): string {
  let t = text
    .replace(/\s*\[[^\]]+\]/g, "")
    .replace(/AI summary adjusted:\s*/gi, "")
    .replace(/Fact-check notes?:\s*/gi, "")
    .replace(/Missing evidence for[^.;]+[.;]?\s*/gi, "")
    .replace(/\b(?:BLACK|RED|BLUE|GREEN|YELLOW)\s+FLAG\s+PRODUCT:\s*/gi, "")
    .replace(/See ingredient details below[^.]*\.?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/^all \d+ ingredients were identified\.?$/i.test(t)) {
    return "";
  }

  return t;
}

function tierIngredients(data: AnalyzeProductResponse, tier: IngredientTier) {
  return data.ingredients
    .map((ing, idx) => ({ ing, idx }))
    .filter(({ ing }) => ing.tier === tier);
}

function primaryTierToExpand(data: AnalyzeProductResponse): IngredientTier | undefined {
  for (const tier of TIER_ORDER) {
    if (tierIngredients(data, tier).length > 0) return tier;
  }
  return undefined;
}

function renderIngredientRows(items: { ing: AnalyzeProductResponse["ingredients"][number] }[]): string {
  if (items.length === 0) {
    return `<p class="ingredient-row__note">None in this category.</p>`;
  }
  return items
    .map(({ ing }) => {
      const note = ing.potentialConcerns ?? ing.shortNote ?? ing.description ?? "";
      const noteHtml = note
        ? `<div class="ingredient-row__note">${escapeHtml(note.slice(0, 160))}${note.length > 160 ? "…" : ""}</div>`
        : "";
      return `<div class="ingredient-row">
        <div class="ingredient-row__name">${escapeHtml(ing.name)}</div>
        ${noteHtml}
      </div>`;
    })
    .join("");
}

function bindAccordions(root: ShadowRoot): void {
  root.querySelectorAll<HTMLButtonElement>(".accordion__trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      const panelId = trigger.getAttribute("aria-controls");
      const panel = panelId ? root.getElementById(panelId) : null;
      trigger.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (panel) panel.hidden = expanded;
    });
  });
}

function applyHostPosition(host: HTMLElement): void {
  Object.assign(host.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    left: "auto",
    top: "auto",
    zIndex: "2147483647",
    width: "min(392px, calc(100vw - 40px))",
    maxWidth: "392px",
    margin: "0",
    padding: "0",
    border: "none",
    background: "transparent",
    pointerEvents: "auto",
    boxSizing: "border-box",
    opacity: "0",
    transform: "translateY(16px) scale(0.98)",
    transition: "opacity 0.24s ease, transform 0.24s ease",
  });
}

function mountCard(html: string, onClose: () => void): ShadowRoot {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  applyHostPosition(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${tokensCss}\n${componentsCss}\n${cardCss}`;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  shadow.appendChild(wrap);

  shadow.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", onClose);
  bindAccordions(shadow);

  const mountRoot = document.body ?? document.documentElement;
  mountRoot.appendChild(host);
  requestAnimationFrame(() => {
    host.style.opacity = "1";
    host.style.transform = "translateY(0) scale(1)";
  });
  return shadow;
}

export function hideResultsCard(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function showAnalysisError(message: string): void {
  mountCard(
    `<article class="results-card results-card--error" role="dialog" aria-label="Analysis error">
      <header class="results-card__header results-card__header--red">
        <div class="results-card__header-top">
          <div class="results-card__header-copy">
            <div class="results-card__brand">AI Scanner</div>
            <h2 class="results-card__verdict">Analysis unavailable</h2>
            <p class="results-card__hint">${escapeHtml(message)}</p>
          </div>
          ${iconButton("Close", { "data-close": "true" })}
        </div>
      </header>
    </article>`,
    hideResultsCard,
  );
}

export function showResultsCard(data: AnalyzeProductResponse): void {
  const flag = data.productClassification;
  const flagText = FLAG_LABELS[flag];
  const expandTier = primaryTierToExpand(data);

  const allChips = data.ingredients
    .map((ing) => ingredientChip(ing.name, ing.tier))
    .join("");

  const categoryAccordions = TIER_ORDER.map((tier) => {
    const items = tierIngredients(data, tier);
    if (items.length === 0) return "";
    return accordionSection({
      id: `tier-${tier.toLowerCase()}`,
      title: TIER_LABELS[tier],
      tier,
      count: items.length,
      bodyHtml: renderIngredientRows(items),
      expanded: tier === expandTier,
    });
  }).join("");

  const warningBanner =
    data.warnings?.length || flag === "YELLOW"
      ? `<div class="warning-banner" role="alert">
          <span class="warning-banner__icon" aria-hidden="true">!</span>
          <span>${escapeHtml(
            data.warnings?.join(" ") ??
              "The ingredient list appears incomplete. Results may be less accurate.",
          )}</span>
        </div>`
      : "";

  const summaryText = data.agentReport ? cleanSummary(data.agentReport) : "";
  const insightBlock =
    summaryText.length > 24
      ? `<section class="insight-card" aria-label="AI insight">
          <div class="insight-card__label">Summary</div>
          <p class="insight-card__text">${escapeHtml(summaryText)}</p>
        </section>`
      : "";

  const personalized =
    data.personalizedRisk &&
    data.personalizedRisk !== data.generalRisk &&
    data.personalizationReasons?.length
      ? `<div class="personalized-note"><strong>For you:</strong> ${escapeHtml(data.personalizationReasons[0]!)}</div>`
      : "";

  const footer = `${escapeHtml(sourceLabel(data.resultSource))} · ${escapeHtml(provenanceLabel(data.provenance))}`;

  mountCard(
    `<article class="results-card results-card--${flag.toLowerCase()}" role="dialog" aria-label="Ingredient analysis results">
      <header class="results-card__header results-card__header--${flag.toLowerCase()}">
        <div class="results-card__header-top">
          <div class="results-card__header-copy">
            <div class="results-card__meta-row">
              <span class="results-card__brand">AI Scanner</span>
              <span class="results-card__stat">${data.totalIngredients} ingredients</span>
            </div>
            <div class="results-card__verdict-row">
              ${flagBadge(flag, flagText)}
            </div>
            <p class="results-card__hint">${escapeHtml(FLAG_HINTS[flag])}</p>
          </div>
          ${iconButton("Close results", { "data-close": "true" })}
        </div>
      </header>
      <div class="results-card__body">
        ${warningBanner}
        ${personalized}
        ${insightBlock}
        <details class="results-fold" open>
          <summary class="results-fold__trigger">
            <span>All ingredients</span>
            <span class="results-fold__count">${data.totalIngredients}</span>
          </summary>
          <div class="chip-grid chip-grid--compact">${allChips}</div>
        </details>
        <section class="results-card__section" aria-labelledby="by-category-heading">
          <h3 class="results-card__section-title" id="by-category-heading">By category</h3>
          <div class="accordion-stack">${categoryAccordions}</div>
        </section>
      </div>
      <footer class="results-card__footer">${footer}</footer>
    </article>`,
    hideResultsCard,
  );
}
