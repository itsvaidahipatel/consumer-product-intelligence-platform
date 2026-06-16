import { describe, expect, it } from "vitest";
import { classifyProduct, labelsForProductClassification } from "./services/product-classification.js";

describe("classifyProduct", () => {
  it("forces YELLOW when incomplete", () => {
    const banner = classifyProduct(false, ["GREEN"]);
    expect(banner.classification).toBe("YELLOW");
  });

  it("picks worst tier when complete", () => {
    expect(classifyProduct(true, ["GREEN", "BLUE", "RED"]).classification).toBe("RED");
  });
});

describe("labelsForProductClassification", () => {
  it("returns stable copy for each persisted classification", () => {
    expect(labelsForProductClassification("BLUE").label).toContain("BLUE");
    expect(labelsForProductClassification("YELLOW").subtitle).toContain("Incomplete");
  });
});
