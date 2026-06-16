import { describe, expect, it } from "vitest";
import { evaluateIngredientCompleteness } from "./services/completeness.js";

describe("evaluateIngredientCompleteness", () => {
  it("flags incomplete lists", () => {
    const res = evaluateIngredientCompleteness("a,b,c", ["a", "b", "c"]);
    expect(res.completenessFlag).toBe(false);
    expect(res.issues).toContain("below_minimum_ingredient_count");
  });

  it("accepts long clean lists", () => {
    const tokens = Array.from({ length: 10 }, (_, i) => `ingredient${i}`);
    const text = tokens.join(", ");
    const res = evaluateIngredientCompleteness(text, tokens);
    expect(res.completenessFlag).toBe(true);
  });

  it("accepts newline-only INCI blobs when token count is high (no commas in raw)", () => {
    const tokens = Array.from({ length: 14 }, (_, i) => `ingredient${i}`);
    const text = tokens.join("\n");
    const res = evaluateIngredientCompleteness(text, tokens);
    expect(res.completenessFlag).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  it("detects placeholder copy", () => {
    const tokens = Array.from({ length: 10 }, (_, i) => `ingredient${i}`);
    const text = `${tokens.join(", ")}. Refer to label for full list.`;
    const res = evaluateIngredientCompleteness(text, tokens);
    expect(res.completenessFlag).toBe(false);
  });
});
