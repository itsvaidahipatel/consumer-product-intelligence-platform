const fields = {
  apiBaseUrl: document.querySelector<HTMLInputElement>("#apiBaseUrl")!,
  apiKey: document.querySelector<HTMLInputElement>("#apiKey")!,
  enableAnalysis: document.querySelector<HTMLSelectElement>("#enableAnalysis")!,
  maxGalleryImages: document.querySelector<HTMLInputElement>("#maxGalleryImages")!,
  analysisMode: document.querySelector<HTMLSelectElement>("#analysisMode")!,
  forceRefresh: document.querySelector<HTMLSelectElement>("#forceRefresh")!,
  save: document.querySelector<HTMLButtonElement>("#save")!,
  msg: document.querySelector<HTMLDivElement>("#msg")!,
  privacyPolicyLink: document.querySelector<HTMLAnchorElement>("#privacyPolicyLink")!,
};

fields.privacyPolicyLink.href = chrome.runtime.getURL("privacy-policy.html");

async function load(): Promise<void> {
  const s = await chrome.storage.sync.get([
    "apiBaseUrl",
    "apiKey",
    "enableAnalysis",
    "enableQuickie",
    "maxGalleryImages",
    "analysisMode",
    "forceRefresh",
  ]);

  fields.apiBaseUrl.value = String(s.apiBaseUrl ?? "http://localhost:8787");
  fields.apiKey.value = String(s.apiKey ?? "");
  const enableAnalysis =
    typeof s.enableAnalysis === "boolean" ? s.enableAnalysis : s.enableQuickie !== false;
  fields.enableAnalysis.value = enableAnalysis ? "true" : "false";
  fields.maxGalleryImages.value = String(s.maxGalleryImages ?? 12);
  fields.analysisMode.value = String(s.analysisMode ?? "DOM_AND_VISION");
  fields.forceRefresh.value = s.forceRefresh ? "true" : "false";
}

fields.save.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBaseUrl: fields.apiBaseUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    enableAnalysis: fields.enableAnalysis.value === "true",
    maxGalleryImages: Number(fields.maxGalleryImages.value || 12),
    analysisMode: fields.analysisMode.value,
    forceRefresh: fields.forceRefresh.value === "true",
  });
  await chrome.storage.sync.remove("enableQuickie").catch(() => {});
  fields.msg.textContent = "Saved.";
  setTimeout(() => {
    fields.msg.textContent = "";
  }, 1500);
});

void load();
