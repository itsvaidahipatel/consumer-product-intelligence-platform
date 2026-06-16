const HOST_ID = "ai-scanner-pdp-button-host";

export function injectPdpAnalyzeButton(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.bottom = "80px";
  host.style.right = "16px";
  host.style.zIndex = "2147483645";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    button {
      all: initial;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 700;
      padding: 12px 18px;
      border-radius: 999px;
      border: none;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(135deg, #0d9488, #0891b2);
      box-shadow: 0 4px 16px rgba(13, 148, 136, 0.35);
    }
    button:hover { filter: brightness(1.05); }
  `;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Analyze Product";
  btn.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "AI_SCANNER_OPEN_AND_ANALYZE" });
  });
  shadow.appendChild(style);
  shadow.appendChild(btn);
  document.documentElement.appendChild(host);
}
