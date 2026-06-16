import { ImageAnnotatorClient } from "@google-cloud/vision";

export type DocumentOcrResult = {
  text: string;
  /** Mean confidence of detected paragraphs when available, else heuristic. */
  confidence: number;
};

export type VisionClient = {
  documentTextFromBuffer(buffer: Buffer): Promise<DocumentOcrResult>;
};

export function createVisionFromEnv(credentialsJson?: string): VisionClient | null {
  if (!credentialsJson) return null;
  const credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
  const client = new ImageAnnotatorClient({ credentials });

  return {
    async documentTextFromBuffer(buffer: Buffer): Promise<DocumentOcrResult> {
      const [result] = await client.documentTextDetection({ image: { content: buffer } });
      const full = result.fullTextAnnotation;
      const text = full?.text?.trim() ?? "";

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

      return { text, confidence };
    },
  };
}

/** Test double that avoids network calls to Google. */
export function createMockVision(fixed: DocumentOcrResult): VisionClient {
  return {
    async documentTextFromBuffer(): Promise<DocumentOcrResult> {
      return fixed;
    },
  };
}
