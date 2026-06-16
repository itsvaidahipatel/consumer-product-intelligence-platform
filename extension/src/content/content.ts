import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";
import { showAnalysisBanner } from "./banner.js";
import { resolveStrategy } from "./strategies/index.js";

declare global {
  interface Window {
    __INGREDIENT_SCANNER_CS_BOOTSTRAPPED__?: boolean;
  }
}

/** Avoid duplicate listeners if `scripting.executeScript` reinjects this file. */
if (window.__INGREDIENT_SCANNER_CS_BOOTSTRAPPED__) {
  // Module may re-run on programmatic injection; listener already registered.
} else {
  window.__INGREDIENT_SCANNER_CS_BOOTSTRAPPED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "INGREDIENT_SCANNER_EXTRACT") {
      const strategy = resolveStrategy(window.location.href);
      if (!strategy) {
        sendResponse({ ok: false, error: "This page is not a supported retailer yet." });
        return;
      }
      try {
        sendResponse({ ok: true, payload: strategy.extract() });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "extract_failed",
        });
      }
      return;
    }

    if (message?.type === "INGREDIENT_SCANNER_SHOW_BANNER") {
      try {
        showAnalysisBanner(message.payload as AnalyzeProductResponse);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "banner_failed",
        });
      }
      return;
    }

    return false;
  });
}
