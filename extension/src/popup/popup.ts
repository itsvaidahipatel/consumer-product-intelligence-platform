import {
  ANALYSIS_JOB_KEY,
  RESULTS_VISIBLE_KEY,
  readAnalysisJob,
  type AnalysisJobState,
  type ResultsVisibleState,
} from "../panel/analysis-job-storage.js";
import {
  getActiveTabId,
  readProductTitle,
  startAnalyze,
} from "../analyze/analyze-flow.js";

const POPUP_TIMEOUT_MS = 130_000;
const RESULTS_CONFIRM_MS = 2_500;

const productTitleEl = document.querySelector<HTMLHeadingElement>("#productTitle")!;
const analyzeBtn = document.querySelector<HTMLButtonElement>("#analyze")!;
const freshBtn = document.querySelector<HTMLButtonElement>("#analyze-fresh")!;
const privacyLink = document.querySelector<HTMLAnchorElement>("#privacyLink")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const actionsEl = document.querySelector<HTMLDivElement>(".popup__actions")!;

privacyLink.href = chrome.runtime.getURL("privacy-policy.html");

let waitingTabId: number | undefined;
let waitingRunId: string | undefined;
let closeFallbackTimer: ReturnType<typeof setTimeout> | undefined;
let resultsConfirmTimer: ReturnType<typeof setTimeout> | undefined;

function setButtonsDisabled(disabled: boolean): void {
  analyzeBtn.disabled = disabled;
  freshBtn.disabled = disabled;
}

function showLoading(label: string): void {
  clearResultsConfirm();
  statusEl.hidden = false;
  statusEl.className = "popup__status popup__status--loading";
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-live", "polite");
  statusEl.innerHTML = `<span class="popup__spinner" aria-hidden="true"></span><span>${label}</span>`;
  actionsEl.hidden = true;
}

function showSuccess(message: string): void {
  waitingTabId = undefined;
  waitingRunId = undefined;
  clearCloseFallback();
  clearResultsConfirm();
  statusEl.hidden = false;
  statusEl.className = "popup__status popup__status--success";
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-live", "polite");
  statusEl.textContent = message;
  actionsEl.hidden = false;
  setButtonsDisabled(false);
}

function showError(message: string): void {
  waitingTabId = undefined;
  waitingRunId = undefined;
  clearCloseFallback();
  clearResultsConfirm();
  statusEl.hidden = false;
  statusEl.className = "popup__status popup__status--error";
  statusEl.setAttribute("role", "alert");
  statusEl.textContent = message;
  actionsEl.hidden = false;
  setButtonsDisabled(false);
}

function clearCloseFallback(): void {
  if (closeFallbackTimer != null) {
    clearTimeout(closeFallbackTimer);
    closeFallbackTimer = undefined;
  }
}

function clearResultsConfirm(): void {
  if (resultsConfirmTimer != null) {
    clearTimeout(resultsConfirmTimer);
    resultsConfirmTimer = undefined;
  }
}

function scheduleCloseFallback(): void {
  clearCloseFallback();
  closeFallbackTimer = setTimeout(() => {
    waitingTabId = undefined;
    waitingRunId = undefined;
    showError("Analysis timed out. Check the product page or try again.");
  }, POPUP_TIMEOUT_MS);
}

async function readResultsVisible(): Promise<ResultsVisibleState | undefined> {
  const stored = await chrome.storage.local.get(RESULTS_VISIBLE_KEY);
  return stored[RESULTS_VISIBLE_KEY] as ResultsVisibleState | undefined;
}

function resultsMatchJob(
  visible: ResultsVisibleState | undefined,
  tabId: number,
  runId: string,
): boolean {
  return visible?.tabId === tabId && visible?.runId === runId;
}

function confirmResultsOnPage(tabId: number, runId: string): void {
  clearResultsConfirm();
  resultsConfirmTimer = setTimeout(() => {
    void readResultsVisible().then((visible) => {
      if (resultsMatchJob(visible, tabId, runId)) {
        showSuccess("Results are on the product page (bottom-right).");
        return;
      }
      showError(
        "Analysis finished but results could not be shown on this page. Reload the tab and try again.",
      );
    });
  }, RESULTS_CONFIRM_MS);
}

function handleResultsVisible(state: ResultsVisibleState | undefined): void {
  if (waitingTabId == null || !waitingRunId || !state) return;
  if (!resultsMatchJob(state, waitingTabId, waitingRunId)) return;
  showSuccess("Results are on the product page (bottom-right).");
}

async function loadProductTitle(): Promise<void> {
  const tabId = await getActiveTabId();
  if (!tabId) {
    productTitleEl.textContent = "Open a product page to analyze";
    setButtonsDisabled(true);
    return;
  }
  productTitleEl.textContent = await readProductTitle(tabId);
}

async function run(forceRefresh: boolean): Promise<void> {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  await chrome.storage.local.remove(RESULTS_VISIBLE_KEY);

  setButtonsDisabled(true);
  showLoading(forceRefresh ? "Running fresh analysis…" : "Analyzing ingredients…");

  const result = await startAnalyze({ tabId, forceRefresh });

  if (!result.ok) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "INGREDIENT_SCANNER_SHOW_ERROR",
        message: result.error,
      });
    } catch {
      /* content script may be unavailable */
    }
    showError(result.error);
    return;
  }

  waitingTabId = tabId;
  waitingRunId = result.runId;
  scheduleCloseFallback();
  showLoading(forceRefresh ? "Running fresh analysis…" : "Analyzing ingredients…");
}

function applyJobState(job: AnalysisJobState | undefined): void {
  if (!job || job.phase === "idle") return;

  if (job.phase === "running") {
    if (waitingRunId && job.runId !== waitingRunId) return;
    waitingTabId = job.tabId;
    waitingRunId = job.runId;
    setButtonsDisabled(true);
    showLoading("Analyzing ingredients…");
    scheduleCloseFallback();
    return;
  }

  if (job.phase === "error") {
    if (waitingRunId && job.runId !== waitingRunId) return;
    showError(job.message);
    return;
  }

  if (job.phase === "done") {
    if (waitingRunId && job.runId !== waitingRunId) return;
    showLoading("Showing results on page…");
    void readResultsVisible().then((visible) => {
      if (resultsMatchJob(visible, job.tabId, job.runId)) {
        showSuccess("Results are on the product page (bottom-right).");
        return;
      }
      confirmResultsOnPage(job.tabId, job.runId);
    });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes[ANALYSIS_JOB_KEY]) {
    applyJobState(changes[ANALYSIS_JOB_KEY].newValue as AnalysisJobState | undefined);
  }

  if (changes[RESULTS_VISIBLE_KEY]) {
    handleResultsVisible(changes[RESULTS_VISIBLE_KEY].newValue as ResultsVisibleState | undefined);
  }
});

analyzeBtn.addEventListener("click", () => {
  void run(false);
});

freshBtn.addEventListener("click", () => {
  void run(true);
});

void loadProductTitle();

void readAnalysisJob().then((job) => {
  if (job?.phase === "running" && job.runId) {
    waitingTabId = job.tabId;
    waitingRunId = job.runId;
    applyJobState(job);
    return;
  }
  if (job?.phase === "done" && job.runId) {
    waitingTabId = job.tabId;
    waitingRunId = job.runId;
    applyJobState(job);
  }
});
