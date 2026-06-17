function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function injectContent(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Deliver a message to the product tab, reinjecting content.js if needed. */
export async function deliverToTab(
  tabId: number,
  message: Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch {
      await injectContent(tabId);
      await sleep(80 * (attempt + 1));
    }
  }
  return false;
}
