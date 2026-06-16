import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";
import "./sidepanel.css";
import { ANALYSIS_JOB_KEY, readAnalysisJob, type AnalysisJobState } from "./analysis-job-storage.js";

const PANEL_TAG = "[AIScanner:Panel]";

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

  function tierLabel(tier: AnalyzeProductResponse["ingredients"][number]["tier"]): string {
    switch (tier) {
      case "BLACK":
        return "Severe concern";
      case "RED":
        return "High concern";
      case "BLUE":
        return "Moderate concern";
      case "GREEN":
        return "Low concern";
    }
  }

  function concernSummary(counts: AnalyzeProductResponse["tierCounts"]): string {
    const parts: string[] = [];
    if (counts.BLACK) parts.push(`${counts.BLACK} severe`);
    if (counts.RED) parts.push(`${counts.RED} high`);
    if (counts.BLUE) parts.push(`${counts.BLUE} moderate`);
    if (counts.GREEN) parts.push(`${counts.GREEN} low`);
    return parts.join(" · ");
  }

  function cleanSummaryText(text: string): string {
    return text.replace(/\s*\[[^\]]+\]/g, "").replace(/\s{2,}/g, " ").trim();
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
      tier: AnalyzeProductResponse["ingredients"][number]["tier"],
    ): string => {
      const items = tierItems(tier);
      if (items.length === 0) return "";
      const rows = items
        .map(({ ing, idx }) => {
          const note = ing.potentialConcerns ?? ing.shortNote ?? ing.description ?? "";
          const noteHtml = note
            ? `<div class="tier-ingredient__note">${escapeHtml(note.slice(0, 160))}${note.length > 160 ? "…" : ""}</div>`
            : "";
          return `<button type="button" class="tier-ingredient" data-ing-index="${idx}">
          <div class="tier-ingredient__name">${escapeHtml(ing.name)}</div>
          ${noteHtml}
        </button>`;
        })
        .join("");
      return `<section class="tier-section tier-section--${tier}">
        <div class="tier-section__head">${escapeHtml(tierLabel(tier))} <span class="tier-section__count">${items.length}</span></div>
        <div class="tier-section__list">${rows}</div>
      </section>`;
    };

    const isCached = data.resultSource === "cache";
    const cacheHint = isCached
      ? `<p class="cache-hint">Showing a saved result. Use <strong>Re-analyze</strong> below for a fresh check.</p>`
      : "";

    const personalized =
      data.personalizedRisk &&
      data.personalizedRisk !== data.generalRisk &&
      data.personalizationReasons?.length
        ? `<div class="personalized-callout">
        <strong>For you:</strong> ${escapeHtml(data.personalizationReasons[0]!)}
        ${data.personalizationReasons.length > 1 ? `<span class="personalized-more"> +${data.personalizationReasons.length - 1} more</span>` : ""}
      </div>`
        : "";

    const summaryText = data.agentReport ? cleanSummaryText(data.agentReport) : "";

    const tierBlocks = (["BLACK", "RED", "BLUE", "GREEN"] as const)
      .map((t) => tierSectionHtml(t))
      .join("");

    resultsEl.innerHTML = `
    <div class="banner ${bannerClass(data.productClassification)}">
      <div class="banner__title">${escapeHtml(data.productClassificationLabel)}</div>
      <div class="sub">${escapeHtml(data.productClassificationSubtitle)}</div>
      <div class="banner__stats">${escapeHtml(concernSummary(counts))}</div>
    </div>
    ${personalized}
    ${summaryText ? `<section class="insight-card"><p class="insight-card__text">${escapeHtml(summaryText)}</p></section>` : ""}
    ${cacheHint}
    ${tierBlocks}
    <div class="feedback-block">
      <span class="feedback-label">Was this helpful?</span>
      <div class="feedback-row">
        <button type="button" class="secondary feedback-btn" data-vote="helpful">Yes</button>
        <button type="button" class="secondary feedback-btn" data-vote="not_helpful">No</button>
      </div>
    </div>
  `;

    resultsEl.querySelectorAll(".feedback-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        void submitFeedback(data, (btn as HTMLButtonElement).dataset.vote ?? "helpful");
      });
    });

    if (data.warnings?.length) {
      const w = document.createElement("div");
      w.className = "result-warning";
      w.textContent = data.warnings.join(" ");
      resultsEl.insertBefore(w, resultsEl.querySelector(".feedback-block"));
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

  async function submitFeedback(data: AnalyzeProductResponse, vote: string): Promise<void> {
    if (!data.analysisId) {
      setStatus("Cannot send feedback — no analysis ID.");
      return;
    }
    const settings = await chrome.storage.sync.get(["apiBaseUrl", "apiKey"]);
    const apiBaseUrl = String(settings.apiBaseUrl ?? "http://localhost:8787").replace(/\/$/, "");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (settings.apiKey) headers["x-api-key"] = String(settings.apiKey);
    try {
      const res = await fetch(`${apiBaseUrl}/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({ analysisId: data.analysisId, vote, labels: [] }),
      });
      setStatus(res.ok ? "Thanks for your feedback." : `Feedback failed (${res.status}).`);
    } catch {
      setStatus("Feedback failed — is the API running?");
    }
  }

  function openDetail(ing: AnalyzeProductResponse["ingredients"][number]): void {
    const modal = document.createElement("div");
    modal.className = "modal open";
    const concern = ing.potentialConcerns ?? ing.shortNote ?? "";
    const evidenceLinks = (ing.evidenceRefs ?? [])
      .filter((e) => e.url)
      .slice(0, 3)
      .map(
        (e) =>
          `<a href="${escapeHtml(e.url!)}" target="_blank" rel="noopener">${escapeHtml(e.title ?? "Source")}</a>`,
      )
      .join(" · ");
    modal.innerHTML = `
    <div class="modal-card">
      <h3>${escapeHtml(ing.name)}</h3>
      <p class="modal-tier">${escapeHtml(tierLabel(ing.tier))}</p>
      ${ing.description ? `<p class="modal-body">${escapeHtml(ing.description)}</p>` : ""}
      ${concern ? `<div class="modal-label">Note</div><p class="modal-body">${escapeHtml(concern)}</p>` : ""}
      ${evidenceLinks ? `<div class="modal-label">Sources</div><p class="modal-links">${evidenceLinks}</p>` : ""}
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
      setStatus("Analysis complete");
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
      opts.forceRefresh ? "Reading page…" : "Reading page…",
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
      "userPreferences",
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
        userPreferences: settings.userPreferences as Record<string, boolean> | undefined,
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
      note: "API work runs in service worker; watch [AIScanner:SW] logs",
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
