import type { SiteId } from "../selectors.js";
import { SELECTORS } from "../selectors.js";
import {
  collectAmazonIndiaGalleryImages,
  collectGalleryImagesWithMeta,
  expandCollapsedSections,
  findIngredientishText,
  pickFirstText,
} from "../dom-utils.js";

export type PageExtractPayload = {
  url: string;
  siteId: SiteId;
  productName: string;
  retailerProductId: string;
  rawIngredientText: string;
  locale: string;
  imageUrls: string[];
  imageMeta: { url: string; width?: number; height?: number }[];
};

export interface SiteStrategy {
  readonly siteId: SiteId;
  canHandle(url: URL): boolean;
  extract(): PageExtractPayload;
}

function metaFor(entries: { url: string; alt?: string }[]): PageExtractPayload["imageMeta"] {
  return entries.map((e) => ({ url: e.url, alt: e.alt }));
}

export abstract class BaseStrategy implements SiteStrategy {
  abstract readonly siteId: SiteId;
  abstract canHandle(url: URL): boolean;

  extract(): PageExtractPayload {
    const cfg = SELECTORS[this.siteId];
    expandCollapsedSections(document, cfg.ingredientSections);
    const url = window.location.href;
    const productName = pickFirstText(cfg.title);
    const rawIngredientText = findIngredientishText(cfg.ingredientSections);
    const gallery =
      this.siteId === "amazon_in"
        ? collectAmazonIndiaGalleryImages(36)
        : collectGalleryImagesWithMeta(cfg.gallery, 20);
    const imageUrls = gallery.map((g) => g.url);
    return {
      url,
      siteId: this.siteId,
      productName: productName || document.title,
      retailerProductId: this.extractProductId(new URL(url)),
      rawIngredientText,
      locale: "en-IN",
      imageUrls,
      imageMeta: metaFor(gallery),
    };
  }

  protected abstract extractProductId(url: URL): string;
}
