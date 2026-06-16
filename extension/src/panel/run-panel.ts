import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";
import "./sidepanel.css";
import { ANALYSIS_JOB_KEY, readAnalysisJob, type AnalysisJobState } from "./analysis-job-storage.js";

const PANEL_TAG = "[IngredientScanner:Panel]";

function panelLog(phase: string, sinceClickMs: number, extra?: Record<string, unknown>): void {
  const detail = {
    wall_iso: new Date().toISOString(),
    since_analyze_click_ms: Math.round(sinceClickMs),
    ...extra,
  };
  console.info(`${PANEL_TAG} ${phase}`, detail);
}

export function mountAnalyzePanel(): void {
  const analyzeBtn = document.querySelector<HTMLButtonElement>("#analyze")!;
  const analyzeFreshBtn = document.querySelector<HTMLButtonElement>("#analyze-fresh")!;
  const statusEl = document.querySelector<HTMLDivElement>("#status")!;
  const resultsEl = document.querySelector<HTMLDivElement>("#results")!;

  function setAnalyzeButtonsDisabled(disabled: boolean): void {
    analyzeBtn.disabled = disabled;
    analyzeFreshBtn.disabled = disabled;
  }

  let currentAnalysis: AnalyzeProductResponse | null = null;

  resultsEl.addEventListener("click", (ev) => {
    if (!currentAnalysis) return;
    const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-ing-index]");
    if (!el) return;
    const idx = Number(el.dataset.ingIndex);
    if (Number.isNaN(idx)) return;
    openDetail(currentAnalysis.ingredients[idx]);
  });

  resultsEl.addEventListener("keydown", (ev) => {
    if (!currentAnalysis) return;
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".ing-link[data-ing-index]");
    if (!el) return;
    ev.preventDefault();
    const idx = Number(el.dataset.ingIndex);
    if (Number.isNaN(idx)) return;
    openDetail(currentAnalysis.ingredients[idx]);
  });

  function setStatus(text: string): void {
    statusEl.hidden = false;
    statusEl.textContent = text;
  }

  function bannerClass(classification: string): string {
    return classification;
  }

  function renderResults(data: AnalyzeProductResponse): void {
    currentAnalysis = data;
    resultsEl.hidden = false;
    const counts = data.tierCounts;

    const tierItems = (tier: AnalyzeProductResponse["ingredients"][number]["tier"]) => {
      const out: { ing: AnalyzeProductResponse["ingredients"][number]; idx: number }[] = [];
      data.ingredients.forEach((ing, idx) => {
        if (ing.tier === tier) out.push({ ing, idx });
      });
      return out;
    };

    const tierSectionHtml = (
      title: string,
      tier: AnalyzeProductResponse["ingredients"][number]["tier"],
    ): string => {
      const items = tierItems(tier);
      if (items.length === 0) return "";
      const rows = items
        .map(({ ing, idx }) => {
          const note = ing.shortNote ?? "Tap for details.";
          return `<div class="tier-ingredient" data-ing-index="${idx}">
          <div class="tier-ingredient__name">${escapeHtml(ing.name)}</div>
          <div class="tier-ingredient__note">${escapeHtml(note)}</div>
        </div>`;
        })
        .join("");
      return `<section class="tier-section tier-section--${tier}">
        <div class="tier-section__head">${escapeHtml(title)} <span class="tier-section__count">(${items.length})</span></div>
        <div class="tier-section__list">${rows}</div>
      </section>`;
    };

    const fullListParagraph =
      data.ingredients.length === 0
        ? '<span class="ingredient-paragraph--empty">No ingredients in this result.</span>'
        : data.ingredients
            .map(
              (ing, idx) =>
                `<span class="ing-link" data-ing-index="${idx}" role="link" tabindex="0">${escapeHtml(ing.name)}</span>`,
            )
            .join(", ");

    const sourcePillClass =
      data.resultSource === "cache" ? "pill pill--meta pill--source-cache" : "pill pill--meta pill--source-fresh";
    const prov = data.provenance;
    const provPillClass =
      prov === "dom"
        ? "pill pill--meta pill--prov-dom"
        : prov === "ocr"
          ? "pill pill--meta pill--prov-ocr"
          : "pill pill--meta pill--prov-merged";
    const cacheHint =
      data.resultSource === "cache"
        ? `<div class="cache-hint">This is a <strong>saved</strong> analysis from an earlier run. Click <strong>Fresh run (skip cache)</strong> above, or enable <strong>Force refresh</strong> in options, then analyze again.</div>`
        : "";

    resultsEl.innerHTML = `
    <div class="banner ${bannerClass(data.productClassification)}">
      <div>${escapeHtml(data.productClassificationLabel)}</div>
      <div class="sub">${escapeHtml(data.productClassificationSubtitle)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__title">Analysis summary</div>
      <div class="stat-strip">
        <div class="stat"><span class="stat__value">${data.totalIngredients}</span><span class="stat__label">Total</span></div>
        <div class="stat stat--black"><span class="stat__value">${counts.BLACK}</span><span class="stat__label">Black</span></div>
        <div class="stat stat--red"><span class="stat__value">${counts.RED}</span><span class="stat__label">Red</span></div>
        <div class="stat stat--blue"><span class="stat__value">${counts.BLUE}</span><span class="stat__label">Blue</span></div>
        <div class="stat stat--green"><span class="stat__value">${counts.GREEN}</span><span class="stat__label">Green</span></div>
      </div>
    </div>
    <div class="meta-row">
      <div class="${sourcePillClass}">Source: ${escapeHtml(data.resultSource)}</div>
      <div class="${provPillClass}">Provenance: ${escapeHtml(data.provenance)}</div>
    </div>
    ${cacheHint}
    <section class="full-list-card">
      <div class="full-list-card__label">Complete ingredient list</div>
      <p class="ingredient-paragraph">${fullListParagraph}</p>
    </section>
    ${tierSectionHtml("Black ingredients", "BLACK")}
    ${tierSectionHtml("Red ingredients", "RED")}
    ${tierSectionHtml("Blue ingredients", "BLUE")}
    ${tierSectionHtml("Green ingredients", "GREEN")}
    <div class="future-tabs">
      Coming later: Safety analysis, regulatory info, scientific sources, similar and alternative products.
    </div>
  `;

    if (data.warnings?.length) {
      const w = document.createElement("div");
      w.className = "result-warning";
      w.textContent = data.warnings.join(" ");
      resultsEl.appendChild(w);
    }
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return map[c] ?? c;
    });
  }

  function openDetail(ing: AnalyzeProductResponse["ingredients"][number]): void {
    const modal = document.createElement("div");
    modal.className = "modal open";
    const reg = ing.regulatoryStatus
      ? Object.entries(ing.regulatoryStatus)
          .map(([k, v]) => `${escapeHtml(k.toUpperCase())}: ${escapeHtml(String(v))}`)
          .join("<br/>")
      : "Not available";
    modal.innerHTML = `
    <div class="modal-card">
      <h3>${escapeHtml(ing.name)}</h3>
      <div class="label">Tier</div>
      <p>${escapeHtml(ing.tier)}</p>
      <div class="label">Function</div>
      <p>${escapeHtml(ing.function ?? "—")}</p>
      <div class="label">Description</div>
      <p>${escapeHtml(ing.description ?? "—")}</p>
      <div class="label">Potential concerns</div>
      <p>${escapeHtml(ing.potentialConcerns ?? ing.shortNote ?? "—")}</p>
      <div class="label">Regulatory status</div>
      <p>${reg}</p>
      <div class="label">Sources</div>
      <p>${escapeHtml((ing.sources ?? []).join(", ") || "—")}</p>
      <button id="close-modal" type="button" class="primary">Close</button>
    </div>
  `;
    document.body.appendChild(modal);
    const close = () => {
      modal.remove();
      document.removeEventListener("keydown", onDocKey);
    };
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onDocKey);
    modal.querySelector("#close-modal")!.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
  }

  function applyJobState(job: AnalysisJobState | undefined): void {
    if (!job || job.phase === "idle") return;
    if (job.phase === "running") {
      setAnalyzeButtonsDisabled(true);
      resultsEl.hidden = true;
      setStatus("Analyzing… (you can switch tabs — results appear here when ready.)");
      return;
    }
    if (job.phase === "error") {
      setAnalyzeButtonsDisabled(false);
      resultsEl.hidden = true;
      setStatus(job.message);
      return;
    }
    if (job.phase === "done") {
      setAnalyzeButtonsDisabled(false);
      setStatus(`Done (${job.data.resultSource})`);
      renderResults(job.data);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[ANALYSIS_JOB_KEY]) return;
    const next = changes[ANALYSIS_JOB_KEY].newValue as AnalysisJobState | undefined;
    applyJobState(next);
  });

  void readAnalysisJob().then((job) => {
    applyJobState(job);
  });

  async function getActiveTabId(): Promise<number | undefined> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  type ExtractReply =
    | { ok: true; payload: Record<string, unknown> }
    | { ok: false; error?: string };

  async function extractFromActiveTab(tabId: number, sinceClickMs: number): Promise<ExtractReply> {
    const send = (): Promise<unknown> =>
      chrome.tabs.sendMessage(tabId, { type: "INGREDIENT_SCANNER_EXTRACT" });

    try {
      const first = await send();
      return first as ExtractReply;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const noReceiver =
        msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection");

      if (!noReceiver) {
        panelLog("content_send_failed", sinceClickMs, { error: msg });
        return { ok: false, error: msg };
      }

      panelLog("content_script_missing_try_inject", sinceClickMs, { tab_id: tabId });

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
      } catch (injectErr) {
        const injectMsg = injectErr instanceof Error ? injectErr.message : String(injectErr);
        panelLog("content_script_inject_failed", sinceClickMs, { error: injectMsg });
        try {
          const tab = await chrome.tabs.get(tabId);
          const url = tab.url ?? "unknown URL";
          return {
            ok: false,
            error: `Cannot scan this tab (${url}). Use a supported product page (e.g. amazon.in) in the focused window, or reload the page after installing the extension.`,
          };
        } catch {
          return {
            ok: false,
            error:
              "Cannot scan this tab. Open a supported retailer product page in the active tab, then try Analyze again.",
          };
        }
      }

      try {
        const second = await send();
        return second as ExtractReply;
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        panelLog("content_send_after_inject_failed", sinceClickMs, { error: msg2 });
        return {
          ok: false,
          error: `The page still did not respond (${msg2}). Try refreshing the product tab.`,
        };
      }
    }
  }

  async function run(opts: { forceRefresh: boolean }): Promise<void> {
    const clickT0 = performance.now();
    try {
    setAnalyzeButtonsDisabled(true);
    resultsEl.hidden = true;
    setStatus(
      opts.forceRefresh
        ? "Reading page… (fresh run — server cache will be skipped)"
        : "Reading page…",
    );
    panelLog("analyze_click", performance.now() - clickT0, { force_refresh: opts.forceRefresh });

    const tabId = await getActiveTabId();
    panelLog("active_tab_resolved", performance.now() - clickT0, { tab_id: tabId });
    if (!tabId) {
      setStatus("No active tab.");
      setAnalyzeButtonsDisabled(false);
      return;
    }

    const extractT0 = performance.now();
    const extract = await extractFromActiveTab(tabId, performance.now() - clickT0);
    panelLog("content_extract_done", performance.now() - clickT0, {
      extract_duration_ms: Math.round(performance.now() - extractT0),
      ok: Boolean(extract?.ok),
    });
    if (!extract?.ok) {
      setStatus(extract?.error ?? "Unable to read this page.");
      setAnalyzeButtonsDisabled(false);
      return;
    }

    const settings = await chrome.storage.sync.get([
      "apiBaseUrl",
      "apiKey",
      "enableAnalysis",
      "enableQuickie",
      "maxGalleryImages",
      "analysisMode",
      "forceRefresh",
    ]);
    const enableAnalysis =
      typeof settings.enableAnalysis === "boolean"
        ? settings.enableAnalysis
        : settings.enableQuickie !== false;

    if (!enableAnalysis) {
      setStatus("Ingredient analysis is disabled in options.");
      setAnalyzeButtonsDisabled(false);
      return;
    }

    const apiBaseUrl = String(settings.apiBaseUrl ?? "http://localhost:8787").replace(/\/$/, "");
    const maxImages = Number(settings.maxGalleryImages ?? 12);

    await chrome.storage.local.set({
      [ANALYSIS_JOB_KEY]: { phase: "running", startedAt: Date.now(), tabId } satisfies AnalysisJobState,
    });
    panelLog("storage_running_primed", performance.now() - clickT0, { tab_id: tabId });

    const bgT0 = performance.now();
    const resp = (await chrome.runtime.sendMessage({
      type: "INGREDIENT_SCANNER_ANALYZE",
      tabId,
      payload: {
        ...extract.payload,
        analysisMode: settings.analysisMode === "DOM_ONLY" ? "DOM_ONLY" : "DOM_AND_VISION",
        forceRefresh: opts.forceRefresh ? true : Boolean(settings.forceRefresh),
        imageUrls: (extract.payload.imageUrls as string[]).slice(0, maxImages),
      },
      apiBaseUrl,
      apiKey: settings.apiKey ? String(settings.apiKey) : "",
    })) as { ok?: boolean; accepted?: boolean; error?: string } | undefined;

    panelLog("background_message_replied", performance.now() - clickT0, {
      background_handoff_ms: Math.round(performance.now() - bgT0),
      accepted: resp?.accepted === true,
      ok: resp?.ok === true,
    });

    const lastErr = chrome.runtime.lastError?.message;
    if (lastErr) {
      await chrome.storage.local.set({
        [ANALYSIS_JOB_KEY]: {
          phase: "error",
          tabId,
          message: lastErr,
          finishedAt: Date.now(),
        } satisfies AnalysisJobState,
      });
      setAnalyzeButtonsDisabled(false);
      return;
    }

    if (!resp?.ok || resp.accepted !== true) {
      await chrome.storage.local.set({
        [ANALYSIS_JOB_KEY]: {
          phase: "error",
          tabId,
          message: resp?.error ?? "Could not start analysis job.",
          finishedAt: Date.now(),
        } satisfies AnalysisJobState,
      });
      setAnalyzeButtonsDisabled(false);
      return;
    }

    setStatus("Analyzing… (you can switch tabs — results appear here when ready.)");
    panelLog("panel_waiting_for_storage_job", performance.now() - clickT0, {
      note: "API work runs in service worker; watch [IngredientScanner:SW] logs",
    });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      panelLog("run_failed", performance.now() - clickT0, { error: message });
      setStatus(message);
      setAnalyzeButtonsDisabled(false);
    }
  }

  analyzeBtn.addEventListener("click", () => {
    void run({ forceRefresh: false });
  });

  analyzeFreshBtn.addEventListener("click", () => {
    void run({ forceRefresh: true });
  });
}
