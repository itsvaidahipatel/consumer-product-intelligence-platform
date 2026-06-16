import type { AnalyzeProductResponse } from "@ingredient-scanner/shared";

const HOST_ID = "ingredient-scanner-banner-host";

export function showAnalysisBanner(data: AnalyzeProductResponse): void {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.right = "12px";
  host.style.bottom = "12px";
  host.style.zIndex = "2147483646";

  const shadow = host.attachShadow({ mode: "open" });
  const panel = document.createElement("section");
  panel.innerHTML = `
    <style>
      :host { all: initial; font-family: system-ui, sans-serif; }
      .card {
        width: 280px;
        border-radius: 12px;
        padding: 10px 12px;
        color: #0b1220;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        border: 1px solid rgba(0,0,0,0.08);
        background: #fff;
      }
      .title { font-weight: 800; font-size: 13px; }
      .sub { font-size: 12px; margin-top: 4px; opacity: 0.85; }
      .counts { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px; margin-top: 8px; font-size: 12px; }
      .pill { background: #f3f4f6; border-radius: 999px; padding: 4px 8px; text-align: center; }
      button { margin-top: 8px; width: 100%; border: 0; border-radius: 10px; padding: 8px; cursor: pointer; font-weight: 700; background: #111827; color: #fff; }
    </style>
    <div class="card">
      <div class="title">${escape(data.productClassificationLabel)}</div>
      <div class="sub">${escape(data.productClassificationSubtitle)}</div>
      <div class="counts">
        <div class="pill">Black: ${data.tierCounts.BLACK}</div>
        <div class="pill">Red: ${data.tierCounts.RED}</div>
        <div class="pill">Blue: ${data.tierCounts.BLUE}</div>
        <div class="pill">Green: ${data.tierCounts.GREEN}</div>
      </div>
      <button type="button" id="close">Dismiss</button>
    </div>
  `;

  shadow.appendChild(panel);
  shadow.querySelector("#close")?.addEventListener("click", () => host.remove());

  document.documentElement.appendChild(host);
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[c] ?? c;
  });
}
