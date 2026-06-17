// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import {
  extractAmazonIndiaIngredients,
  findIngredientishText,
  stripRetailerNoise,
} from "./dom-utils.js";

describe("stripRetailerNoise", () => {
  it("removes common prefixes", () => {
    expect(stripRetailerNoise("Ingredients: Water, Glycerin")).toBe("Water, Glycerin");
  });

  it("preserves newlines between lines", () => {
    expect(stripRetailerNoise("Ingredients: Aqua\nGlycerin")).toBe("Aqua\nGlycerin");
  });
});

describe("findIngredientishText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("picks the INCI chunk over A+ marketing bleed", () => {
    document.body.innerHTML = `
      <div id="importantInformation_feature_div">
        Ingredients: Aqua, Glycerin, Niacinamide, Ceramide NP, Phenoxyethanol
      </div>
      <div id="aplus_feature_div">
        Key ingredients ceramides hyaluronic acid cleanses hydrates logShoppableMetrics module-5
        .aplus-v2 padding-right: 0.1rem customer reviews
      </div>
    `;
    const text = findIngredientishText(["#importantInformation_feature_div", "#aplus_feature_div"]);
    expect(text).toContain("Aqua");
    expect(text).not.toMatch(/logshoppablemetrics|padding-right|customer reviews/i);
  });
});

describe("extractAmazonIndiaIngredients", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reads ingredients from product details table row", () => {
    document.body.innerHTML = `
      <table id="productDetails_techSpec_section_1">
        <tr><th>Ingredients</th><td>Aqua, Glycerin, Niacinamide, Ceramide NP</td></tr>
      </table>
    `;
    expect(extractAmazonIndiaIngredients()).toBe("Aqua, Glycerin, Niacinamide, Ceramide NP");
  });

  it("reads ingredients heading inside Important Information", () => {
    document.body.innerHTML = `
      <div id="importantInformation_feature_div">
        <span class="a-text-bold">Ingredients</span>
        <p>Aqua, Glycerin, Hyaluronic Acid, Phenoxyethanol</p>
      </div>
    `;
    expect(extractAmazonIndiaIngredients()).toContain("Hyaluronic Acid");
  });

  it("rejects marketing bullets without comma-separated INCI", () => {
    document.body.innerHTML = `
      <div id="importantInformation_feature_div">
        Key ingredients ceramides 1 hyaluronic acid benefits cleanses
        hydrates & helps restore the protective skin barrier
      </div>
    `;
    expect(extractAmazonIndiaIngredients()).toBe("");
  });
});
