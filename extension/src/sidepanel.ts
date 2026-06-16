import { mountAnalyzePanel } from "./panel/run-panel.js";

mountAnalyzePanel();

const privacyFooter = document.querySelector<HTMLAnchorElement>("#privacyPolicyFooter");
if (privacyFooter) {
  privacyFooter.href = chrome.runtime.getURL("privacy-policy.html");
}
