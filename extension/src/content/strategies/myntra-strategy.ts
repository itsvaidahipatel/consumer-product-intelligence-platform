import { BaseStrategy } from "./base-strategy.js";

export class MyntraStrategy extends BaseStrategy {
  readonly siteId = "myntra";

  canHandle(url: URL): boolean {
    return url.hostname.includes("myntra.com");
  }

  protected extractProductId(url: URL): string {
    const m = url.pathname.match(/\/p\/([^/]+)/);
    return m?.[1] ?? url.pathname;
  }
}
