import { describe, expect, it } from "vitest";
import { resolveDomVsOcr } from "./services/conflict-resolution.js";

describe("resolveDomVsOcr", () => {
  it("prefers DOM when OCR missing", () => {
    const pick = resolveDomVsOcr({
      domText: "a,b,c,d,e,f,g,h",
      domCompletenessFlag: true,
      ocrCompletenessFlag: false,
    });
    expect(pick.source).toBe("dom");
  });

  it("prefers OCR when DOM incomplete but OCR complete", () => {
    const pick = resolveDomVsOcr({
      domText: "a,b",
      ocrText: "a,b,c,d,e,f,g,h,i",
      domCompletenessFlag: false,
      ocrCompletenessFlag: true,
    });
    expect(pick.source).toBe("ocr");
  });
});
