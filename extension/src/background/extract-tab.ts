import { resolveStrategy } from "../content/strategies/index.js";

export type ExtractReply =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error?: string };

const NO_RECEIVER = "__NO_RECEIVER__";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNoReceiverError(message: string): boolean {
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  );
}

async function sendExtract(tabId: number): Promise<ExtractReply> {
  try {
    const reply = await chrome.tabs.sendMessage(tabId, { type: "INGREDIENT_SCANNER_EXTRACT" });
    return reply as ExtractReply;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isNoReceiverError(msg)) {
      return { ok: false, error: NO_RECEIVER };
    }
    return { ok: false, error: msg };
  }
}

async function injectContentScript(tabId: number): Promise<ExtractReply | null> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return null;
  } catch {
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab.url ?? "this tab";
      return {
        ok: false,
        error: `Cannot inject on ${url}. Reload the product page after installing or updating the extension.`,
      };
    } catch {
      return {
        ok: false,
        error: "Cannot access this tab. Open a supported retailer product page and reload it.",
      };
    }
  }
}

export async function extractFromTab(tabId: number): Promise<ExtractReply> {
  let tabUrl = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    tabUrl = tab.url ?? "";
    if (!tabUrl.startsWith("http")) {
      return {
        ok: false,
        error: "Open a retailer product page first — browser internal pages cannot be scanned.",
      };
    }
    if (!resolveStrategy(tabUrl)) {
      return {
        ok: false,
        error: "This site is not supported yet. Try Amazon.in, Nykaa, Myntra, Blinkit, or Zepto.",
      };
    }
  } catch {
    return { ok: false, error: "Could not read the active tab." };
  }

  let result = await sendExtract(tabId);
  if (result.ok || (result.error && result.error !== NO_RECEIVER)) {
    return result;
  }

  const injectErr = await injectContentScript(tabId);
  if (injectErr) {
    return injectErr;
  }

  for (const delayMs of [0, 80, 200, 500, 1000]) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    result = await sendExtract(tabId);
    if (result.ok || (result.error && result.error !== NO_RECEIVER)) {
      return result;
    }
  }

  return {
    ok: false,
    error: "Could not connect to this page. Reload the product tab, then try Analyze again.",
  };
}
