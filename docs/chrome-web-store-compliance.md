# Chrome Web Store — compliance notes (AI Scanner)

Use this alongside **`extension/public/privacy-policy.html`**. For the store’s **Privacy policy** field, use a **public HTTPS URL** to that file after it is on `main`, for example:

`https://raw.githubusercontent.com/itsvaidahipatel/ingredient-scanner/main/extension/public/privacy-policy.html`

(Replace owner/repo if you fork or rename.) If GitHub serves it as `text/plain`, the listing usually still accepts it; alternatively host the same HTML on GitHub Pages or your own domain.

| # | Principle | How this project aligns |
|---|-----------|-------------------------|
| 1 | Manifest V3 | `manifest_version: 3`, ES module service worker, no MV2 APIs. |
| 2 | Single purpose | One thing: optional ingredient analysis on supported PDPs via user-initiated action. |
| 3 | Real user value | Functional analyze flow, DOM + optional server/OCR pipeline—not a placeholder shell. |
| 4 | Necessary permissions | See privacy policy §7; each permission maps to extraction, panel, or API calls. |
| 5 | Transparent data use | Privacy policy discloses payload fields, storage, and user-configured API. |
| 6 | No deception | No impersonation; extension name/description match behavior. |
| 7 | No malware | No credential theft, no silent tracking, no phishing patterns in code paths reviewed for release. |
| 8 | No spam | No review manipulation guidance; one listing, honest metadata. |
| 9 | Accurate listing | Keep store description, screenshots, and permissions in sync with each release. |
| 10 | No obfuscation | Ship readable source; Vite bundles but does not hide malicious behavior—reviewers can read repo + built output. |
| 11 | No remote executable code | No `eval` of remote JS; no `<script src="https://…">` for extension logic; only JSON `fetch` to configured API. |
| 12 | Proper Chrome APIs | Uses `sidePanel`, `storage`, `scripting`, messaging—no unsupported bypasses for core flows. |
| 13 | Affiliate consent | No affiliate links in extension code paths reviewed for release. |
| 14 | Notifications | No spam notification usage for promos. |
| 15 | No unsolicited messages | No email/SMS on user’s behalf; only user-triggered API calls. |
| 16 | Works | Test each supported retailer + API before submission; fix broken hosts in manifest if sites change. |
| 17 | Secure data | Prefer HTTPS API; optional `x-api-key`; minimize what you send; operator secures server + DB. |
| 18 | Developer 2FA | Enable on your Google developer account (store requirement). |
| 19 | IP / trademarks | Do not use retailer logos as your extension icon without permission; listing text should not claim official partnership unless true. |
| 20 | Pre-submit checklist | Re-verify rows above; update privacy policy date when behavior changes. |

**Before submission:** load unpacked `extension/dist`, run an end-to-end analyze on each declared `host_permissions` retailer, and confirm the privacy policy URL opens without login.

---

## Store listing copy (AI Scanner)

**Short description:** Analyze product ingredients on supported Indian retailer PDPs with evidence-backed safety insights.

**Full description:** AI Scanner is a Chrome extension that helps you understand what's in the products you shop for online. On supported product pages (Amazon.in, Nykaa, Myntra, Blinkit, Zepto), click **Analyze Product** or open the side panel to extract the ingredient list, match it against an internal encyclopedia, and retrieve cited evidence from our knowledge base. Optional personalization toggles (vegan, allergies, pregnancy, sensitive skin) adjust risk for your profile. Analysis runs against a user-configured API endpoint; no account required for the extension itself.

**Category:** Shopping

**Single purpose:** Ingredient transparency for online product detail pages.
