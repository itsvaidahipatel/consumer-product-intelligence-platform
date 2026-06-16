import { BaseStrategy } from "./base-strategy.js";

export class NykaaStrategy extends BaseStrategy {
  readonly siteId = "nykaa";

  canHandle(url: URL): boolean {
    return url.hostname.includes("nykaa.com");
  }

  protected extractProductId(url: URL): string {
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? url.pathname;
  }
}
