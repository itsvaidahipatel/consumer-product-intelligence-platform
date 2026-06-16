import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";

/** chrome.storage.local key for in-flight / last analysis job state. */
export const ANALYSIS_JOB_KEY = "ingredientAnalysisJob" as const;

export type AnalysisJobState =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number; tabId: number }
  | { phase: "done"; tabId: number; data: AnalyzeProductResponse; finishedAt: number }
  | { phase: "error"; tabId: number; message: string; finishedAt: number };

export async function readAnalysisJob(): Promise<AnalysisJobState | undefined> {
  const v = await chrome.storage.local.get(ANALYSIS_JOB_KEY);
  return v[ANALYSIS_JOB_KEY] as AnalysisJobState | undefined;
}
