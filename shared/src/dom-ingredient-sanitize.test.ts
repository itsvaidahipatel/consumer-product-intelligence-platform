import { describe, expect, it } from "vitest";
import { sanitizeDomIngredientBlob } from "./dom-ingredient-sanitize.js";

describe("sanitizeDomIngredientBlob", () => {
  it("keeps INCI lines after last Ingredients: and cuts before Directions", () => {
    const raw = `Important safety avoid eyes ingredients: aqua
Glycerin
Niacinamide
citric acid directions: apply all over. target audience: adult`;
    expect(sanitizeDomIngredientBlob(raw)).toBe(`aqua
Glycerin
Niacinamide
citric acid`);
  });

  it("chops Amazon script/style bleed", () => {
    const raw = `ingredients: aqua
Glycerin
.po-break-word word-break: break-word
function logtechtermassistmetric() {}`;
    expect(sanitizeDomIngredientBlob(raw)).toBe(`aqua
Glycerin`);
  });

  it("does not treat active ingredients marketing as the INCI label when Ingredients: exists later", () => {
    const raw = `ph balanced active ingredients hydrating glycerin ingredients: aqua
Glycerin`;
    expect(sanitizeDomIngredientBlob(raw)).toBe(`aqua
Glycerin`);
  });

  it("chops Amazon A+ CSS and logShoppableMetrics bleed", () => {
    const raw = `ingredients: aqua, glycerin, niacinamide
.aplus-v2 .aplus-review-right-padding padding-right: 0.1rem
logShoppableMetrics module-5`;
    expect(sanitizeDomIngredientBlob(raw)).toBe("aqua, glycerin, niacinamide");
  });

  it("cuts marketing copy after INCI (key ingredients, skin type)", () => {
    const raw = `ingredients: aqua, glycerin, ceramide np key ingredients: ceramides skin type: normal to oily`;
    expect(sanitizeDomIngredientBlob(raw)).toBe("aqua, glycerin, ceramide np");
  });
});
