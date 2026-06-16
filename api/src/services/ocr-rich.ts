import type { DocumentOcrResult, VisionClient } from "./vision.js";

export type OcrBoundingBox = {
  text: string;
  confidence?: number;
  vertices: { x: number; y: number }[];
};

export type RichDocumentOcrResult = DocumentOcrResult & {
  boundingBoxes: OcrBoundingBox[];
  rawAnnotation?: unknown;
};

export function extractBoundingBoxes(annotation: unknown): OcrBoundingBox[] {
  const boxes: OcrBoundingBox[] = [];
  const full = annotation as {
    pages?: {
      blocks?: {
        confidence?: number;
        boundingBox?: { vertices?: { x?: number; y?: number }[] };
        paragraphs?: { words?: { symbols?: { text?: string }[] }[] }[];
      }[];
    }[];
  };
  for (const page of full?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      const vertices = (block.boundingBox?.vertices ?? []).map((v) => ({
        x: v.x ?? 0,
        y: v.y ?? 0,
      }));
      const words: string[] = [];
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          words.push((word.symbols ?? []).map((s) => s.text ?? "").join(""));
        }
      }
      boxes.push({
        text: words.join(" ").trim(),
        confidence: block.confidence,
        vertices,
      });
    }
  }
  return boxes;
}

export function createRichVisionClient(base: VisionClient): VisionClient & {
  documentTextRichFromBuffer(buffer: Buffer): Promise<RichDocumentOcrResult>;
} {
  return {
    ...base,
    async documentTextFromBuffer(buffer: Buffer): Promise<DocumentOcrResult> {
      return base.documentTextFromBuffer(buffer);
    },
    async documentTextRichFromBuffer(buffer: Buffer): Promise<RichDocumentOcrResult> {
      const simple = await base.documentTextFromBuffer(buffer);
      return {
        ...simple,
        boundingBoxes: [],
        rawAnnotation: undefined,
      };
    },
  };
}
