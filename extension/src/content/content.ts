import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";
import { showAnalysisError, showResultsCard } from "../ui/results-card.js";
import { injectPdpAnalyzeButton } from "./pdp-button.js";
import { resolveStrategy } from "./strategies/index.js";

declare global {
  interface Window {
    __AIScannerMessageHandler__?: (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void;
  }
}

function installMessageListener(): void {
  if (window.__AIScannerMessageHandler__) {
    chrome.runtime.onMessage.removeListener(window.__AIScannerMessageHandler__);
  }

  window.__AIScannerMessageHandler__ = (message, _sender, sendResponse) => {
    if (message && typeof message === "object" && "type" in message) {
      const type = (message as { type?: string }).type;

      if (type === "INGREDIENT_SCANNER_EXTRACT") {
        void (async () => {
          const strategy = resolveStrategy(window.location.href);
          if (!strategy) {
            sendResponse({ ok: false, error: "This page is not a supported retailer yet." });
            return;
          }
          try {
            if (strategy.siteId === "amazon_in") {
              const { prepareAmazonIndiaPageForExtraction } = await import("./dom-utils.js");
              await prepareAmazonIndiaPageForExtraction();
            }
            sendResponse({ ok: true, payload: strategy.extract() });
          } catch (err) {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : "extract_failed",
            });
          }
        })();
        return true;
      }

      if (type === "INGREDIENT_SCANNER_SHOW_BANNER") {
        try {
          showResultsCard((message as { payload: AnalyzeProductResponse }).payload);
          const runId = (message as { runId?: string }).runId;
          if (runId) {
            void signalResultsVisible(runId);
          }
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : "results_card_failed",
          });
        }
        return;
      }

      if (type === "INGREDIENT_SCANNER_SHOW_ERROR") {
        try {
          showAnalysisError(String((message as { message?: string }).message ?? "Analysis failed."));
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : "error_card_failed",
          });
        }
        return;
      }
    }

    return false;
  };

  chrome.runtime.onMessage.addListener(window.__AIScannerMessageHandler__);
}

function signalResultsVisible(runId: string): Promise<void> {
  return chrome.runtime
    .sendMessage({ type: "INGREDIENT_SCANNER_UI_VISIBLE", runId })
    .then(() => undefined);
}

installMessageListener();

if (resolveStrategy(window.location.href)) {
  injectPdpAnalyzeButton();
}
