import tokensCss from "../ui/tokens.css?inline";
import componentsCss from "../ui/components.css?inline";
import { startAnalyzeFromContent } from "./run-from-page.js";

const HOST_ID = "ai-scanner-pdp-button-host";

export function injectPdpAnalyzeButton(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.bottom = "88px";
  host.style.right = "16px";
  host.style.zIndex = "2147483645";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${tokensCss}\n${componentsCss}\n
    .pdp-btn {
      all: initial;
      font-family: var(--font);
      font-size: 13px;
      font-weight: 700;
      padding: 12px 18px;
      border-radius: var(--radius-pill);
      border: none;
      cursor: pointer;
      color: #fffdfb;
      background: var(--accent-gradient);
      box-shadow: var(--shadow-md);
    }
    .pdp-btn:hover { box-shadow: var(--shadow-lg); }
    .pdp-btn:focus-visible { box-shadow: var(--focus-ring); }
  `;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pdp-btn";
  btn.textContent = "Analyze";
  btn.setAttribute("aria-label", "Analyze product ingredients");
  btn.addEventListener("click", () => {
    void startAnalyzeFromContent(false);
  });

  shadow.appendChild(style);
  shadow.appendChild(btn);
  document.documentElement.appendChild(host);
}
