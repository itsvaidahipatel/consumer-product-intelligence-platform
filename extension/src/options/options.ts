import { DEFAULT_API_BASE_URL } from "../config.js";

const fields = {
  apiBaseUrl: document.querySelector<HTMLInputElement>("#apiBaseUrl")!,
  apiKey: document.querySelector<HTMLInputElement>("#apiKey")!,
  enableAnalysis: document.querySelector<HTMLSelectElement>("#enableAnalysis")!,
  maxGalleryImages: document.querySelector<HTMLInputElement>("#maxGalleryImages")!,
  analysisMode: document.querySelector<HTMLSelectElement>("#analysisMode")!,
  forceRefresh: document.querySelector<HTMLSelectElement>("#forceRefresh")!,
  prefVegan: document.querySelector<HTMLInputElement>("#prefVegan")!,
  prefVegetarian: document.querySelector<HTMLInputElement>("#prefVegetarian")!,
  prefPregnancy: document.querySelector<HTMLInputElement>("#prefPregnancy")!,
  prefNutAllergy: document.querySelector<HTMLInputElement>("#prefNutAllergy")!,
  prefDairyAllergy: document.querySelector<HTMLInputElement>("#prefDairyAllergy")!,
  prefSensitiveSkin: document.querySelector<HTMLInputElement>("#prefSensitiveSkin")!,
  prefFragranceSensitivity: document.querySelector<HTMLInputElement>("#prefFragranceSensitivity")!,
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
    "userPreferences",
  ]);

  fields.apiBaseUrl.value = String(s.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  fields.apiKey.value = String(s.apiKey ?? "");
  const enableAnalysis =
    typeof s.enableAnalysis === "boolean" ? s.enableAnalysis : s.enableQuickie !== false;
  fields.enableAnalysis.value = enableAnalysis ? "true" : "false";
  fields.maxGalleryImages.value = String(s.maxGalleryImages ?? 12);
  fields.analysisMode.value = String(s.analysisMode ?? "DOM_AND_VISION");
  fields.forceRefresh.value = s.forceRefresh ? "true" : "false";

  const prefs = (s.userPreferences ?? {}) as Record<string, boolean>;
  fields.prefVegan.checked = Boolean(prefs.vegan);
  fields.prefVegetarian.checked = Boolean(prefs.vegetarian);
  fields.prefPregnancy.checked = Boolean(prefs.pregnancy);
  fields.prefNutAllergy.checked = Boolean(prefs.nutAllergy);
  fields.prefDairyAllergy.checked = Boolean(prefs.dairyAllergy);
  fields.prefSensitiveSkin.checked = Boolean(prefs.sensitiveSkin);
  fields.prefFragranceSensitivity.checked = Boolean(prefs.fragranceSensitivity);
}

fields.save.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBaseUrl: fields.apiBaseUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    enableAnalysis: fields.enableAnalysis.value === "true",
    maxGalleryImages: Number(fields.maxGalleryImages.value || 12),
    analysisMode: fields.analysisMode.value,
    forceRefresh: fields.forceRefresh.value === "true",
    userPreferences: {
      vegan: fields.prefVegan.checked,
      vegetarian: fields.prefVegetarian.checked,
      pregnancy: fields.prefPregnancy.checked,
      nutAllergy: fields.prefNutAllergy.checked,
      dairyAllergy: fields.prefDairyAllergy.checked,
      sensitiveSkin: fields.prefSensitiveSkin.checked,
      fragranceSensitivity: fields.prefFragranceSensitivity.checked,
    },
  });
  await chrome.storage.sync.remove("enableQuickie").catch(() => {});
  fields.msg.textContent = "Saved.";
  setTimeout(() => {
    fields.msg.textContent = "";
  }, 1500);
});

void load();
