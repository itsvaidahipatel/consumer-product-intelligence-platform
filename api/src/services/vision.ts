import { ImageAnnotatorClient } from "@google-cloud/vision";
import { extractBoundingBoxes, type OcrBoundingBox } from "./ocr-rich.js";

export type DocumentOcrResult = {
  text: string;
  /** Mean confidence of detected paragraphs when available, else heuristic. */
  confidence: number;
};

export type RichDocumentOcrResult = DocumentOcrResult & {
  boundingBoxes: OcrBoundingBox[];
  rawAnnotation?: unknown;
};

export type VisionClient = {
  documentTextFromBuffer(buffer: Buffer): Promise<DocumentOcrResult>;
  documentTextRichFromBuffer(buffer: Buffer): Promise<RichDocumentOcrResult>;
};

function confidenceFromAnnotation(full: { pages?: { blocks?: { confidence?: number }[] }[] } | null | undefined): number {
  let confidence = 0.65;
  if (full?.pages?.length) {
    const confidences: number[] = [];
    for (const page of full.pages) {
      for (const block of page.blocks ?? []) {
        if (typeof block.confidence === "number") confidences.push(block.confidence);
      }
    }
    if (confidences.length > 0) {
      confidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      if (confidence > 1) confidence = confidence / 100;
    }
  }
  return confidence;
}

export function createVisionFromEnv(credentialsJson?: string): VisionClient | null {
  if (!credentialsJson) return null;
  const credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
  const client = new ImageAnnotatorClient({ credentials });

  return {
    async documentTextFromBuffer(buffer: Buffer): Promise<DocumentOcrResult> {
      const rich = await this.documentTextRichFromBuffer(buffer);
      return { text: rich.text, confidence: rich.confidence };
    },
    async documentTextRichFromBuffer(buffer: Buffer): Promise<RichDocumentOcrResult> {
      const [result] = await client.documentTextDetection({ image: { content: buffer } });
      const full = result.fullTextAnnotation;
      const text = full?.text?.trim() ?? "";
      const confidence = confidenceFromAnnotation(
        full as { pages?: { blocks?: { confidence?: number }[] }[] } | null | undefined,
      );
      return {
        text,
        confidence,
        boundingBoxes: extractBoundingBoxes(full),
        rawAnnotation: full ?? undefined,
      };
    },
  };
}

/** Test double that avoids network calls to Google. */
export function createMockVision(fixed: DocumentOcrResult): VisionClient {
  return {
    async documentTextFromBuffer(): Promise<DocumentOcrResult> {
      return fixed;
    },
    async documentTextRichFromBuffer(): Promise<RichDocumentOcrResult> {
      return { ...fixed, boundingBoxes: [], rawAnnotation: undefined };
    },
  };
}
