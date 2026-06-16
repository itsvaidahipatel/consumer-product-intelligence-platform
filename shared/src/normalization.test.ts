import { describe, expect, it } from "vitest";
import { normalizeIngredientToken, splitIngredientBlob } from "./normalization.js";

describe("normalizeIngredientToken", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientToken("  Niacinamide  ")).toBe("niacinamide");
  });

  it("strips noisy punctuation", () => {
    expect(normalizeIngredientToken("Aqua (Water)")).toBe("aqua water");
  });
});

describe("splitIngredientBlob", () => {
  it("splits on commas", () => {
    expect(splitIngredientBlob("Water, Glycerin, Niacinamide")).toEqual([
      "Water",
      "Glycerin",
      "Niacinamide",
    ]);
  });
});
