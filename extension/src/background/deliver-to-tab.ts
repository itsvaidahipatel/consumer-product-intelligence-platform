function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TabMessageReply = { ok?: boolean; error?: string };

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
      const reply = (await chrome.tabs.sendMessage(tabId, message)) as TabMessageReply | undefined;
      if (reply?.ok === true) return true;
    } catch {
      await injectContent(tabId);
      await sleep(80 * (attempt + 1));
    }
  }
  return false;
}
