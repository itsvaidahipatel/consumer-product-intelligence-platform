import { BaseStrategy } from "./base-strategy.js";
import {
  collectAmazonIndiaGalleryImages,
  extractAmazonIndiaIngredients,
  pickFirstText,
} from "../dom-utils.js";
import { SELECTORS } from "../selectors.js";

export class AmazonInStrategy extends BaseStrategy {
  readonly siteId = "amazon_in";

  canHandle(url: URL): boolean {
    return url.hostname.includes("amazon.in");
  }

  extract() {
    const cfg = SELECTORS[this.siteId];
    const url = window.location.href;
    const productName = pickFirstText(cfg.title);
    const gallery = collectAmazonIndiaGalleryImages(36);
    return {
      url,
      siteId: this.siteId,
      productName: productName || document.title,
      retailerProductId: this.extractProductId(new URL(url)),
      rawIngredientText: extractAmazonIndiaIngredients(),
      locale: "en-IN",
      imageUrls: gallery.map((g) => g.url),
      imageMeta: gallery.map((e) => ({ url: e.url, alt: e.alt })),
    };
  }

  protected extractProductId(url: URL): string {
    const m = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
    return m?.[1]?.toUpperCase() ?? url.pathname;
  }
}
