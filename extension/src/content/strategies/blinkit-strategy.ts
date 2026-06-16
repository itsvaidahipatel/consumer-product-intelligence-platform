import { BaseStrategy } from "./base-strategy.js";

export class BlinkitStrategy extends BaseStrategy {
  readonly siteId = "blinkit";

  canHandle(url: URL): boolean {
    return url.hostname.includes("blinkit.com");
  }

  protected extractProductId(url: URL): string {
    return url.searchParams.get("prid") ?? url.pathname;
  }
}
