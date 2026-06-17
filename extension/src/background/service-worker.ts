import type { AnalyzeProductRequest, AnalyzeProductResponse } from "@ingredient-scanner/shared";
import { ANALYSIS_JOB_KEY, RESULTS_VISIBLE_KEY, type AnalysisJobState } from "../panel/analysis-job-storage.js";
import { DEFAULT_API_BASE_URL, LEGACY_LOCAL_API_URL } from "../config.js";
import { extractFromTab } from "./extract-tab.js";
import { deliverToTab } from "./deliver-to-tab.js";

const ANALYZE_TIMEOUT_MS = 120_000;

const SW_TAG = "[AIScanner:SW]";

/** One in-flight analyze per tab — avoids duplicate Railway requests from double-clicks. */
const inFlightByTab = new Map<number, Promise<void>>();

function swLog(phase: string, elapsedMs: number, extra?: Record<string, unknown>): void {
  console.info(SW_TAG, {
    wall_iso: new Date().toISOString(),
    phase,
    elapsed_since_job_start_ms: Math.round(elapsedMs),
    ...extra,
  });
}

type AnalyzeMessage = {
  type: "INGREDIENT_SCANNER_ANALYZE";
  payload: AnalyzeProductRequest;
  apiBaseUrl: string;
  apiKey: string;
  tabId: number;
  runId: string;
};

async function markResultsVisible(tabId: number, runId: string): Promise<void> {
  await chrome.storage.local.set({
    [RESULTS_VISIBLE_KEY]: { tabId, at: Date.now(), runId },
  });
}

async function notifyTabError(tabId: number, message: string, runId?: string): Promise<void> {
  await deliverToTab(tabId, {
    type: "INGREDIENT_SCANNER_SHOW_ERROR",
    message,
    runId: runId ?? "error",
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.get("apiBaseUrl").then(({ apiBaseUrl }) => {
    if (!apiBaseUrl || apiBaseUrl === LEGACY_LOCAL_API_URL) {
      return chrome.storage.sync.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
    }
  });
});

void chrome.storage.sync.get("apiBaseUrl").then(({ apiBaseUrl }) => {
  if (!apiBaseUrl || apiBaseUrl === LEGACY_LOCAL_API_URL) {
    return chrome.storage.sync.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
  }
});

async function runAnalyzeJob(msg: AnalyzeMessage): Promise<void> {
  const jobT0 = performance.now();
  const tabId = msg.tabId;
  const runId = msg.runId;
  swLog("job_started", performance.now() - jobT0, {
    tab_id: tabId,
    api_host: (() => {
      try {
        return new URL(msg.apiBaseUrl).host;
      } catch {
        return "invalid_url";
      }
    })(),
    image_url_count: msg.payload.imageUrls?.length ?? 0,
    analysis_mode: msg.payload.analysisMode,
  });

  await chrome.storage.local.set({
    [ANALYSIS_JOB_KEY]: {
      phase: "running",
      startedAt: Date.now(),
      tabId,
      runId,
    } satisfies AnalysisJobState,
  });

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (msg.apiKey) {
      headers["x-api-key"] = msg.apiKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

    const fetchT0 = performance.now();
    const res = await fetch(`${msg.apiBaseUrl}/analyze/product`, {
      method: "POST",
      headers,
      body: JSON.stringify(msg.payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    swLog("fetch_analyze_product_done", performance.now() - jobT0, {
      http_status: res.status,
      fetch_duration_ms: Math.round(performance.now() - fetchT0),
    });

    if (!res.ok) {
      const text = await res.text();
      let message = `HTTP ${res.status}: `;
      try {
        const j = JSON.parse(text) as {
          error?: string;
          message?: string;
          hint?: string;
          details?: string;
        };
        if (res.status === 401) {
          message =
            "API key required. Open extension Options and paste the same key as Railway INGREDIENT_SCANNER_API_KEYS.";
        } else if (j && typeof j === "object" && typeof j.message === "string") {
          message += [j.message, j.hint, j.details].filter((x) => typeof x === "string" && x.length > 0).join(" — ");
        } else if (j?.hint) {
          message += j.hint;
        } else {
          message += text;
        }
      } catch {
        message += text;
      }
      const trimmed = message.slice(0, 4000);
      await chrome.storage.local.set({
        [ANALYSIS_JOB_KEY]: {
          phase: "error",
          tabId,
          message: trimmed,
          finishedAt: Date.now(),
          runId,
        } satisfies AnalysisJobState,
      });
      await notifyTabError(tabId, trimmed, runId);
      return;
    }

    const data = (await res.json()) as AnalyzeProductResponse;
    swLog("response_json_parsed", performance.now() - jobT0, {
      correlation_id: data.correlationId,
      result_source: data.resultSource,
      total_ingredients: data.totalIngredients,
    });

    const resultsShown = await deliverToTab(tabId, {
      type: "INGREDIENT_SCANNER_SHOW_BANNER",
      payload: data,
      runId,
    });

    if (resultsShown) {
      await markResultsVisible(tabId, runId);
    }

    if (resultsShown) {
      await chrome.storage.local.set({
        [ANALYSIS_JOB_KEY]: {
          phase: "done",
          tabId,
          data,
          finishedAt: Date.now(),
          runId,
        } satisfies AnalysisJobState,
      });
    } else {
      const displayErr =
        "Analysis finished but could not show results on this page. Reload the tab and try again.";
      await chrome.storage.local.set({
        [ANALYSIS_JOB_KEY]: {
          phase: "error",
          tabId,
          message: displayErr,
          finishedAt: Date.now(),
          runId,
        } satisfies AnalysisJobState,
      });
      await notifyTabError(tabId, displayErr, runId);
    }

    swLog("job_finished_ok", performance.now() - jobT0, {
      correlation_id: data.correlationId,
      total_wall_ms: Math.round(performance.now() - jobT0),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Request timed out after ${ANALYZE_TIMEOUT_MS / 1000}s`
          : err.message
        : "network_error";
    await chrome.storage.local.set({
      [ANALYSIS_JOB_KEY]: {
        phase: "error",
        tabId,
        message,
        finishedAt: Date.now(),
        runId,
      } satisfies AnalysisJobState,
    });
    await notifyTabError(tabId, message, runId);
  }
}

function enqueueAnalyze(msg: AnalyzeMessage, sendResponse: (r: unknown) => void): boolean {
  if (inFlightByTab.has(msg.tabId)) {
    sendResponse({ ok: false, error: "analysis_already_running" });
    return false;
  }

  const job = runAnalyzeJob(msg).finally(() => {
    inFlightByTab.delete(msg.tabId);
  });
  inFlightByTab.set(msg.tabId, job);
  sendResponse({ ok: true, accepted: true as const });
  return false;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const msg = message as {
    type?: string;
    tabId?: number;
    runId?: string;
    payload?: AnalyzeProductRequest;
    forceRefresh?: boolean;
    apiBaseUrl?: string;
    apiKey?: string;
  };

  if (msg.type === "INGREDIENT_SCANNER_ANALYZE") {
    if (typeof msg.tabId !== "number" || !msg.runId) {
      sendResponse({ ok: false, error: "missing_tabId_or_runId" });
      return false;
    }
    return enqueueAnalyze(msg as AnalyzeMessage, sendResponse);
  }

  if (msg.type === "INGREDIENT_SCANNER_ANALYZE_WITH_PAYLOAD") {
    void (async () => {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse({ ok: false, error: "missing_tabId" });
        return;
      }

      const settings = await chrome.storage.sync.get([
        "apiBaseUrl",
        "apiKey",
        "enableAnalysis",
        "enableQuickie",
        "analysisMode",
        "forceRefresh",
        "userPreferences",
      ]);

      const enableAnalysis =
        typeof settings.enableAnalysis === "boolean"
          ? settings.enableAnalysis
          : settings.enableQuickie !== false;

      if (!enableAnalysis) {
        sendResponse({ ok: false, error: "Ingredient analysis is disabled in Options." });
        return;
      }

      const useForceRefresh = msg.forceRefresh ? true : Boolean(settings.forceRefresh);
      if (settings.forceRefresh && !msg.forceRefresh) {
        void chrome.storage.sync.set({ forceRefresh: false });
      }

      const apiBaseUrl = String(settings.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
      const maxImages = Number(settings.maxGalleryImages ?? 12);

      const runId = `${Date.now()}-page`;

      enqueueAnalyze(
        {
          type: "INGREDIENT_SCANNER_ANALYZE",
          tabId,
          runId,
          payload: {
            ...msg.payload!,
            analysisMode: settings.analysisMode === "DOM_ONLY" ? "DOM_ONLY" : "DOM_AND_VISION",
            forceRefresh: useForceRefresh,
            imageUrls: (msg.payload?.imageUrls ?? []).slice(0, maxImages),
            userPreferences: settings.userPreferences as Record<string, boolean> | undefined,
          },
          apiBaseUrl,
          apiKey: settings.apiKey ? String(settings.apiKey) : "",
        },
        sendResponse,
      );
    })();
    return true;
  }

  if (msg.type === "INGREDIENT_SCANNER_EXTRACT_TAB") {
    void (async () => {
      if (typeof msg.tabId !== "number") {
        sendResponse({ ok: false, error: "missing_tabId" });
        return;
      }
      sendResponse(await extractFromTab(msg.tabId));
    })();
    return true;
  }

  if (msg.type === "INGREDIENT_SCANNER_UI_VISIBLE") {
    const tabId = sender.tab?.id;
    const runId = msg.runId;
    if (tabId != null && runId) {
      void markResultsVisible(tabId, runId);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
