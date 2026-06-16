import type { AnalyzeProductRequest, AnalyzeProductResponse } from "@ingredient-scanner/shared";
import { ANALYSIS_JOB_KEY, type AnalysisJobState } from "../panel/analysis-job-storage.js";
import { DEFAULT_API_BASE_URL, LEGACY_LOCAL_API_URL } from "../config.js";

const ANALYZE_TIMEOUT_MS = 120_000;

const SW_TAG = "[AIScanner:SW]";

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
};

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  void chrome.storage.sync.get("apiBaseUrl").then(({ apiBaseUrl }) => {
    if (!apiBaseUrl || apiBaseUrl === LEGACY_LOCAL_API_URL) {
      return chrome.storage.sync.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
    }
  });
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

void chrome.storage.sync.get("apiBaseUrl").then(({ apiBaseUrl }) => {
  if (!apiBaseUrl || apiBaseUrl === LEGACY_LOCAL_API_URL) {
    return chrome.storage.sync.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
  }
});

async function runAnalyzeJob(msg: AnalyzeMessage): Promise<void> {
  const jobT0 = performance.now();
  const tabId = msg.tabId;
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
    [ANALYSIS_JOB_KEY]: { phase: "running", startedAt: Date.now(), tabId } satisfies AnalysisJobState,
  });
  swLog("storage_set_running", performance.now() - jobT0, { tab_id: tabId });

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (msg.apiKey) {
      headers["x-api-key"] = msg.apiKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

    const bodyBytes = new TextEncoder().encode(JSON.stringify(msg.payload)).length;
    swLog("fetch_analyze_product_start", performance.now() - jobT0, {
      body_bytes: bodyBytes,
      timeout_ms: ANALYZE_TIMEOUT_MS,
    });

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
      swLog("http_error_body_read", performance.now() - jobT0, {
        status: res.status,
        body_preview_chars: text.length,
      });
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
      await chrome.storage.local.set({
        [ANALYSIS_JOB_KEY]: {
          phase: "error",
          tabId,
          message: message.slice(0, 4000),
          finishedAt: Date.now(),
        } satisfies AnalysisJobState,
      });
      swLog("job_finished_error", performance.now() - jobT0, { reason: "http_not_ok" });
      return;
    }

    const parseT0 = performance.now();
    const data = (await res.json()) as AnalyzeProductResponse;
    swLog("response_json_parsed", performance.now() - jobT0, {
      parse_duration_ms: Math.round(performance.now() - parseT0),
      correlation_id: data.correlationId,
      result_source: data.resultSource,
      total_ingredients: data.totalIngredients,
    });

    await chrome.storage.local.set({
      [ANALYSIS_JOB_KEY]: {
        phase: "done",
        tabId,
        data,
        finishedAt: Date.now(),
      } satisfies AnalysisJobState,
    });
    swLog("storage_set_done", performance.now() - jobT0, {
      correlation_id: data.correlationId,
    });

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "INGREDIENT_SCANNER_SHOW_BANNER",
        payload: data,
      });
      swLog("content_banner_message_sent", performance.now() - jobT0, { tab_id: tabId });
    } catch (bannerErr) {
      swLog("content_banner_message_skipped", performance.now() - jobT0, {
        tab_id: tabId,
        error: bannerErr instanceof Error ? bannerErr.message : String(bannerErr),
      });
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
    swLog("job_catch", performance.now() - jobT0, {
      error_name: err instanceof Error ? err.name : "unknown",
      message,
    });
    await chrome.storage.local.set({
      [ANALYSIS_JOB_KEY]: {
        phase: "error",
        tabId,
        message,
        finishedAt: Date.now(),
      } satisfies AnalysisJobState,
    });
    swLog("job_finished_error", performance.now() - jobT0, { reason: "exception_or_abort" });
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const msg = message as { type?: string; tabId?: number };

  if (msg.type === "AI_SCANNER_OPEN_AND_ANALYZE") {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId != null) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
      sendResponse({ ok: true, opened: true });
    })();
    return true;
  }

  if (msg.type !== "INGREDIENT_SCANNER_ANALYZE") return false;

  if (typeof msg.tabId !== "number") {
    sendResponse({ ok: false, error: "missing_tabId" });
    return false;
  }

  void runAnalyzeJob(msg as AnalyzeMessage);
  sendResponse({ ok: true, accepted: true as const });
  return false;
});
