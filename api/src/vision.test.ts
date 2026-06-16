import { describe, expect, it } from "vitest";
import { createMockVision } from "./services/vision.js";

describe("Vision client (mocked)", () => {
  it("returns fixed OCR payload", async () => {
    const client = createMockVision({ text: "Water, Glycerin", confidence: 0.9 });
    const res = await client.documentTextFromBuffer(Buffer.from("fake"));
    expect(res.text).toContain("Water");
    expect(res.confidence).toBeGreaterThan(0.5);
  });
});
