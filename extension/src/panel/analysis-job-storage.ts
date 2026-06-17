import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";

/** chrome.storage.local key for in-flight / last analysis job state. */
export const ANALYSIS_JOB_KEY = "ingredientAnalysisJob" as const;

export type AnalysisJobState =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number; tabId: number; runId: string }
  | { phase: "done"; tabId: number; data: AnalyzeProductResponse; finishedAt: number; runId: string }
  | { phase: "error"; tabId: number; message: string; finishedAt: number; runId: string };

/** Set after a successful results card is shown on the product page. */
export const RESULTS_VISIBLE_KEY = "ingredientResultsVisible" as const;

export type ResultsVisibleState = { tabId: number; at: number; runId: string };

export function newRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function readAnalysisJob(): Promise<AnalysisJobState | undefined> {
  const v = await chrome.storage.local.get(ANALYSIS_JOB_KEY);
  return v[ANALYSIS_JOB_KEY] as AnalysisJobState | undefined;
}
