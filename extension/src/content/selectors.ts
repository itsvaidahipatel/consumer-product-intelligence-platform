/**
 * Centralized selectors for retailer DOM scraping.
 * Update these frequently as layouts change.
 */
export const SELECTORS = {
  amazon_in: {
    title: ["#productTitle", "span.product-title-word-break"],
    gallery: [
      /* Fallback when not using collectAmazonIndiaGalleryImages */
      "#altImages ul li.image img",
      "#altImages li img",
      "#landingImage",
    ],
    ingredientSections: [
      "#importantInformation_feature_div",
      "#productDetails_techSpec_section_1",
      "#productDetails_detailBullets_sections1",
    ],
  },
  nykaa: {
    title: ["h1.css-1gc4x7e", "h1", "[data-testid='product-title']"],
    gallery: ["div.css-1bfn5rs img", "img[alt*='product']"],
    ingredientSections: [
      "[class*='Ingredients']",
      "[class*='ingredient']",
      "div.description",
    ],
  },
  myntra: {
    title: ["h1.pdp-title", "h1"],
    gallery: [".image-grid-image img", ".pdp-image img"],
    ingredientSections: [".pdp-productDescriptors", ".pdp-details", "div"],
  },
  blinkit: {
    title: ["h1", "[data-testid='product-title']"],
    gallery: ["img[src*='blinkit']"],
    ingredientSections: ["div", "section"],
  },
  zepto: {
    title: ["h1", "[data-testid='title']"],
    gallery: ["img"],
    ingredientSections: ["div", "section"],
  },
} as const;

export type SiteId = keyof typeof SELECTORS;
