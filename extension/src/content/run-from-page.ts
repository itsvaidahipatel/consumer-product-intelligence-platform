import { resolveStrategy } from "./strategies/index.js";
import { showAnalysisError } from "../ui/results-card.js";

export async function startAnalyzeFromContent(
  forceRefresh: boolean,
): Promise<{ ok: boolean; error?: string; accepted?: boolean }> {
  const strategy = resolveStrategy(window.location.href);
  if (!strategy) {
    return { ok: false, error: "This page is not a supported retailer." };
  }

  let payload;
  try {
    payload = strategy.extract();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "extract_failed" };
  }

  const resp = (await chrome.runtime.sendMessage({
    type: "INGREDIENT_SCANNER_ANALYZE_WITH_PAYLOAD",
    payload,
    forceRefresh,
  })) as { ok?: boolean; accepted?: boolean; error?: string } | undefined;

  if (!resp?.ok) {
    const message = resp?.error ?? "Could not start analysis.";
    showAnalysisError(message);
    return { ok: false, error: message };
  }

  return { ok: true, accepted: resp.accepted };
}
