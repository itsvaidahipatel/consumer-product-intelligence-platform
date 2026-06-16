import { BaseStrategy } from "./base-strategy.js";

export class AmazonInStrategy extends BaseStrategy {
  readonly siteId = "amazon_in";

  canHandle(url: URL): boolean {
    return url.hostname.includes("amazon.in");
  }

  protected extractProductId(url: URL): string {
    const m = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
    return m?.[1]?.toUpperCase() ?? url.pathname;
  }
}
