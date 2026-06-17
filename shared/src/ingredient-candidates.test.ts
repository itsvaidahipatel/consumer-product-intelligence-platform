import { describe, expect, it } from "vitest";
import {
  INGREDIENT_HEADING_PATTERN,
  buildScoredTextCandidates,
  extractOcrCommaInciFallback,
  extractOcrIngredientWindows,
  looksLikeCollapsedRetailerDom,
  scoreIngredientCandidateHeuristic,
  splitIngredientCandidateText,
  tokensFromCandidateText,
} from "./ingredient-candidates.js";

describe("splitIngredientCandidateText", () => {
  it("splits on semicolon, bullet, pipe, and newline", () => {
    expect(splitIngredientCandidateText("A, B; C•D|E\nF")).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("does not split on slashes inside INCI names", () => {
    const s =
      "ALCOHOL DENAT. • VA/CROTONATES/VINYL NEODECANOATE COPOLYMER • OCTYLACRYLAMIDE/ACRYLATES/BUTYLAMINOETHYL METHACRYLATE COPOLYMER • AQUA / WATER";
    expect(splitIngredientCandidateText(s)).toEqual([
      "ALCOHOL DENAT.",
      "VA/CROTONATES/VINYL NEODECANOATE COPOLYMER",
      "OCTYLACRYLAMIDE/ACRYLATES/BUTYLAMINOETHYL METHACRYLATE COPOLYMER",
      "AQUA / WATER",
    ]);
  });

  it("strips L'Oréal-style F.I.L. parenthetical from the blob", () => {
    expect(
      splitIngredientCandidateText("PARFUM / FRAGRANCE • LINALOOL (F.I.L. Z70026310/1)"),
    ).toEqual(["PARFUM / FRAGRANCE", "LINALOOL"]);
  });
});

describe("extractOcrIngredientWindows", () => {
  it("extracts a window after INGREDIENTS line", () => {
    const ocr = `BEST SELLER\nINGREDIENTS:\nWATER, GLYCERIN\nNIACINAMIDE\nUSE DAILY`;
    const wins = extractOcrIngredientWindows(ocr, 10);
    expect(wins.length).toBeGreaterThan(0);
    expect(wins[0]).toContain("WATER");
    expect(wins[0]).toContain("GLYCERIN");
  });

  it("extracts when INGREDIENTS appears mid-line (common Vision layout)", () => {
    const ocr =
      "Foaming Cleanser · INGREDIENTS: AQUA / WATER, COCO-BETAINE, PROPYLENE GLYCOL\nSODIUM CHLORIDE";
    const wins = extractOcrIngredientWindows(ocr, 12);
    expect(wins.length).toBeGreaterThan(0);
    expect(wins[0]).toContain("COCO-BETAINE");
  });
});

describe("extractOcrCommaInciFallback", () => {
  it("detects dense INCI without INGREDIENTS header", () => {
    const blob = `Some noise here
Aqua, Glycerin, Niacinamide, Panthenol, Phenoxyethanol, Citric Acid, Sodium Citrate, Disodium EDTA, Tocopherol, Parfum, Limonene, Linalool
More noise`;
    const got = extractOcrCommaInciFallback(blob);
    expect(got.length).toBe(1);
    expect(got[0]).toContain("Niacinamide");
  });
});

describe("INGREDIENT_HEADING_PATTERN", () => {
  it("does not treat marketing 'active ingredients' without colon as a heading", () => {
    expect(
      INGREDIENT_HEADING_PATTERN.test("ph balanced active ingredients hydrating glycerin"),
    ).toBe(false);
  });

  it("still matches real Active ingredients: lines", () => {
    expect(INGREDIENT_HEADING_PATTERN.test("Active ingredients: Zinc Oxide 10%")).toBe(true);
  });
});

describe("scoreIngredientCandidateHeuristic", () => {
  it("penalizes Cetaphil-style pack front OCR", () => {
    const text =
      "formula cetaphil gentle skin cleanser dry to normal sensitive skin net quantity: 118 ml hydrating glycerin";
    const tokens = tokensFromCandidateText(text);
    const { score } = scoreIngredientCandidateHeuristic({ text, tokens, source: "ocr" });
    expect(score).toBeLessThan(-20);
  });

  it("rewards INCI-like comma list", () => {
    const text =
      "Ingredients: Water, Glycerin, Niacinamide, Phenoxyethanol, Citric Acid, Sodium Chloride, Panthenol, Tocopherol, Disodium EDTA, Fragrance, Limonene, Linalool, Xanthan Gum, Carbomer";
    const tokens = tokensFromCandidateText(text);
    const { score } = scoreIngredientCandidateHeuristic({ text, tokens, source: "dom" });
    expect(score).toBeGreaterThan(60);
  });

  it("penalizes marketing-heavy blurbs", () => {
    const text = "Best Seller Clinically Proven Dermatologist Tested Paraben Free Water";
    const tokens = tokensFromCandidateText(text);
    const { score } = scoreIngredientCandidateHeuristic({ text, tokens, source: "ocr" });
    expect(score).toBeLessThan(30);
  });

  it("penalizes Amazon-style collapsed DOM (see less, won't clog)", () => {
    const text =
      "d won't clog pores ph balanced active ingredients hydrating glycerin niacinamide vitamin b3 panthenol vitamin b5 see less";
    expect(looksLikeCollapsedRetailerDom(text)).toBe(true);
    const tokens = tokensFromCandidateText(text);
    const { score } = scoreIngredientCandidateHeuristic({ text, tokens, source: "dom" });
    expect(score).toBeLessThan(15);
  });
});

describe("looksLikeCollapsedRetailerDom", () => {
  it("detects see less and won't clog", () => {
    expect(looksLikeCollapsedRetailerDom("Niacinamide see less")).toBe(true);
    expect(looksLikeCollapsedRetailerDom("AQUA, GLYCERIN")).toBe(false);
  });
});

describe("buildScoredTextCandidates with ocrChunks", () => {
  it("runs keyword windows per image chunk without merging hero into label text first", () => {
    const hero = "NEW LOOK\nBEST SELLER\nMODEL SHOT\n";
    const label = "INGREDIENTS:\nAQUA, GLYCERIN, NIACINAMIDE, PHENOXYETHANOL\n";
    const c = buildScoredTextCandidates({
      domRaw: "",
      ocrChunks: [hero, label],
    });
    const ocrTexts = c.filter((x) => x.source === "ocr").map((x) => x.text);
    expect(ocrTexts.some((t) => t.includes("NIACINAMIDE"))).toBe(true);
  });

  it("joins all chunks when no per-image snippet qualifies", () => {
    const c = buildScoredTextCandidates({
      domRaw: "",
      ocrChunks: [
        "BEST SELLER front pack",
        "Aqua, Glycerin, Niacinamide, Panthenol",
        "Fooexilate, Baridonate, Bazmicate, Quxilate, Zorbinate, Wexamine",
      ],
    });
    const ocrTexts = c.filter((x) => x.source === "ocr").map((x) => x.text);
    expect(ocrTexts.some((t) => t.includes("Niacinamide"))).toBe(true);
  });
});

describe("tokensFromCandidateText", () => {
  it("drops marketing phrases that are not INCI tokens", () => {
    const tokens = tokensFromCandidateText(`Aqua, Glycerin, ceramides 1, hyaluronic acid benefits cleanses, Niacinamide`);
    expect(tokens).toEqual(["aqua", "glycerin", "niacinamide"]);
  });
});
