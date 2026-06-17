import {
  ANALYSIS_JOB_KEY,
  newRunId,
  type AnalysisJobState,
} from "../panel/analysis-job-storage.js";
import { DEFAULT_API_BASE_URL } from "../config.js";
import type { ExtractReply } from "../background/extract-tab.js";

export type { ExtractReply };

export async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export async function extractFromTab(tabId: number): Promise<ExtractReply> {
  const resp = (await chrome.runtime.sendMessage({
    type: "INGREDIENT_SCANNER_EXTRACT_TAB",
    tabId,
  })) as ExtractReply | undefined;

  if (chrome.runtime.lastError?.message) {
    return { ok: false, error: chrome.runtime.lastError.message };
  }

  return resp ?? { ok: false, error: "Extract failed — background did not respond." };
}

export async function readProductTitle(tabId: number): Promise<string> {
  const extract = await extractFromTab(tabId);
  if (extract.ok && typeof extract.payload.productName === "string" && extract.payload.productName.trim()) {
    return extract.payload.productName.trim();
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    const title = tab.title?.replace(/\s*[|\-–—].*$/, "").trim();
    return title || "Product page";
  } catch {
    return "Product page";
  }
}

export type AnalyzeStartResult =
  | { ok: true; accepted: true; runId: string }
  | { ok: false; error: string };

export async function startAnalyze(opts: {
  tabId: number;
  forceRefresh: boolean;
}): Promise<AnalyzeStartResult> {
  const extract = await extractFromTab(opts.tabId);
  if (!extract.ok) {
    return { ok: false, error: extract.error ?? "Unable to read this page." };
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
    return { ok: false, error: "Ingredient analysis is disabled in Options." };
  }

  const useForceRefresh = opts.forceRefresh ? true : Boolean(settings.forceRefresh);
  if (settings.forceRefresh && !opts.forceRefresh) {
    void chrome.storage.sync.set({ forceRefresh: false });
  }

  const apiBaseUrl = String(settings.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const maxImages = Number(settings.maxGalleryImages ?? 12);
  const runId = newRunId();

  await chrome.storage.local.set({
    [ANALYSIS_JOB_KEY]: {
      phase: "running",
      startedAt: Date.now(),
      tabId: opts.tabId,
      runId,
    } satisfies AnalysisJobState,
  });

  const resp = (await chrome.runtime.sendMessage({
    type: "INGREDIENT_SCANNER_ANALYZE",
    tabId: opts.tabId,
    runId,
    payload: {
      ...extract.payload,
      analysisMode: settings.analysisMode === "DOM_ONLY" ? "DOM_ONLY" : "DOM_AND_VISION",
      forceRefresh: useForceRefresh,
      imageUrls: (extract.payload.imageUrls as string[]).slice(0, maxImages),
      userPreferences: settings.userPreferences as Record<string, boolean> | undefined,
    },
    apiBaseUrl,
    apiKey: settings.apiKey ? String(settings.apiKey) : "",
  })) as { ok?: boolean; accepted?: boolean; error?: string } | undefined;

  const lastErr = chrome.runtime.lastError?.message;
  if (lastErr) {
    return { ok: false, error: lastErr };
  }

  if (!resp?.ok || resp.accepted !== true) {
    const errMsg =
      resp?.error === "analysis_already_running"
        ? "Analysis already running — wait for the current result."
        : (resp?.error ?? "Could not start analysis.");
    return { ok: false, error: errMsg };
  }

  return { ok: true, accepted: true, runId };
}

export function watchAnalysisJob(onUpdate: (job: AnalysisJobState | undefined) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes[ANALYSIS_JOB_KEY]) return;
    onUpdate(changes[ANALYSIS_JOB_KEY].newValue as AnalysisJobState | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
