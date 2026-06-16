import { describe, expect, it } from "vitest";
import { normalizeIngredientToken, splitIngredientBlob, expandIngredientLookupKeys } from "./normalization.js";

describe("normalizeIngredientToken", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientToken("  Niacinamide  ")).toBe("niacinamide");
  });

  it("strips noisy punctuation", () => {
    expect(normalizeIngredientToken("Aqua (Water)")).toBe("aqua water");
  });

  it("strips trailing periods", () => {
    expect(normalizeIngredientToken("parfum / fragrance.")).toBe("parfum / fragrance");
  });
});

describe("expandIngredientLookupKeys", () => {
  it("expands spaced slash INCI aliases", () => {
    expect(expandIngredientLookupKeys("aqua / water")).toEqual(
      expect.arrayContaining(["aqua / water", "aqua", "water"]),
    );
  });

  it("does not split polymer slashes without spaces", () => {
    const keys = expandIngredientLookupKeys("va/crotonates/vinyl neodecanoate copolymer");
    expect(keys).toContain("va/crotonates/vinyl neodecanoate copolymer");
    expect(keys).not.toContain("va");
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
