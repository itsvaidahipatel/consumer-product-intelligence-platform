import { describe, expect, it } from "vitest";
import { stripRetailerNoise } from "./dom-utils.js";

describe("stripRetailerNoise", () => {
  it("removes common prefixes", () => {
    expect(stripRetailerNoise("Ingredients: Water, Glycerin")).toBe("Water, Glycerin");
  });

  it("preserves newlines between lines", () => {
    expect(stripRetailerNoise("Ingredients: Aqua\nGlycerin")).toBe("Aqua\nGlycerin");
  });
});
