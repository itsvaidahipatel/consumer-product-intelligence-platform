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
} from "./classification.js";
import {
  accordionSection,
  flagBadge,
  ingredientChip,
  legendDot,
  iconButton,
} from "./components.js";

const HOST_ID = "ingredient-scanner-results-host";

function cleanSummary(text: string): string {
  return text.replace(/\s*\[[^\]]+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function tierIngredients(data: AnalyzeProductResponse, tier: IngredientTier) {
  return data.ingredients
    .map((ing, idx) => ({ ing, idx }))
    .filter(({ ing }) => ing.tier === tier);
}

function renderIngredientRows(items: { ing: AnalyzeProductResponse["ingredients"][number] }[]): string {
  if (items.length === 0) {
    return `<p class="ingredient-row__note">None in this category.</p>`;
  }
  return items
    .map(({ ing }) => {
      const note = ing.potentialConcerns ?? ing.shortNote ?? ing.description ?? "";
      const noteHtml = note
        ? `<div class="ingredient-row__note">${escapeHtml(note.slice(0, 180))}${note.length > 180 ? "…" : ""}</div>`
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

function mountCard(html: string, onClose: () => void): ShadowRoot {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.className = "card-host";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${tokensCss}\n${componentsCss}\n${cardCss}`;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  shadow.appendChild(wrap);

  shadow.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", onClose);
  bindAccordions(shadow);

  document.documentElement.appendChild(host);
  return shadow;
}

export function hideResultsCard(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function showAnalysisError(message: string): void {
  mountCard(
    `<article class="results-card error-card" role="dialog" aria-label="Analysis error">
      <header class="results-card__header">
        <div class="results-card__header-top">
          <span class="results-card__brand">AI Scanner</span>
          ${iconButton("Close results", { "data-close": "true" })}
        </div>
        <h2 class="results-card__title">Analysis unavailable</h2>
        <p class="results-card__subtitle">${escapeHtml(message)}</p>
      </header>
    </article>`,
    hideResultsCard,
  );
}

export function showResultsCard(data: AnalyzeProductResponse): void {
  const flag = data.productClassification;
  const flagText = FLAG_LABELS[flag];

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
      bodyHtml: renderIngredientRows(items),
      expanded: false,
    });
  }).join("");

  const warningBanner =
    data.warnings?.length || flag === "YELLOW"
      ? `<div class="warning-banner" role="alert">${escapeHtml(
          data.warnings?.join(" ") ??
            "The ingredient list appears incomplete. Results may be less accurate.",
        )}</div>`
      : "";

  const summaryText = data.agentReport ? cleanSummary(data.agentReport) : "";
  const insightBlock = summaryText
    ? `<p class="insight-text">${escapeHtml(summaryText)}</p>`
    : "";

  const personalized =
    data.personalizedRisk &&
    data.personalizedRisk !== data.generalRisk &&
    data.personalizationReasons?.length
      ? `<div class="personalized-note"><strong>For you:</strong> ${escapeHtml(data.personalizationReasons[0]!)}</div>`
      : "";

  const legend = TIER_ORDER.map((tier) => legendDot(tier, TIER_LABELS[tier])).join("");

  const footer = `${escapeHtml(sourceLabel(data.resultSource))} · ${escapeHtml(provenanceLabel(data.provenance))}`;

  mountCard(
    `<article class="results-card" role="dialog" aria-label="Ingredient analysis results">
      <header class="results-card__header">
        <div class="results-card__header-top">
          <div>
            <div class="results-card__brand">AI Scanner</div>
            ${flagBadge(flag, flagText)}
          </div>
          ${iconButton("Close results", { "data-close": "true" })}
        </div>
        <h2 class="results-card__title">${escapeHtml(data.productClassificationLabel)}</h2>
        <p class="results-card__subtitle">${escapeHtml(data.productClassificationSubtitle)}</p>
      </header>
      <div class="results-card__body">
        ${warningBanner}
        ${personalized}
        ${insightBlock}
        <section class="results-card__section" aria-labelledby="all-ingredients-heading">
          <h3 class="results-card__section-title" id="all-ingredients-heading">All Ingredients</h3>
          <div class="chip-grid">${allChips}</div>
        </section>
        <section class="results-card__section" aria-labelledby="by-category-heading">
          <h3 class="results-card__section-title" id="by-category-heading">By Category</h3>
          <div class="legend-row" aria-hidden="true">${legend}</div>
          ${categoryAccordions}
        </section>
      </div>
      <footer class="results-card__footer">${footer}</footer>
    </article>`,
    hideResultsCard,
  );
}
