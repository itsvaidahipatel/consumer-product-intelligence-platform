import { BaseStrategy } from "./base-strategy.js";

export class ZeptoStrategy extends BaseStrategy {
  readonly siteId = "zepto";

  canHandle(url: URL): boolean {
    return url.hostname.includes("zeptonow.com");
  }

  protected extractProductId(url: URL): string {
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? url.pathname;
  }
}
