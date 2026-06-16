import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { ocrRuns } from "../db/schema.js";
import type { OcrBoundingBox } from "./ocr-rich.js";

export const VISION_MODEL_VERSION = "vision-v1";

export type CachedOcrRun = {
  parsedText: string;
  meanConfidence: number | null;
  boundingBoxes: OcrBoundingBox[];
};

export async function findCachedOcrRun(
  db: Db,
  imageUrlHash: string,
): Promise<CachedOcrRun | null> {
  const [row] = await db
    .select()
    .from(ocrRuns)
    .where(
      and(
        eq(ocrRuns.imageUrlHash, imageUrlHash),
        eq(ocrRuns.visionModelVersion, VISION_MODEL_VERSION),
      ),
    )
    .limit(1);

  if (!row?.parsedText) return null;
  return {
    parsedText: row.parsedText,
    meanConfidence: row.meanConfidence,
    boundingBoxes: (row.boundingBoxesJson as OcrBoundingBox[] | null) ?? [],
  };
}

export async function persistOcrRun(
  db: Db,
  args: {
    analysisId: string;
    imageUrl: string;
    imageUrlHash: string;
    parsedText: string;
    meanConfidence?: number;
    boundingBoxes?: OcrBoundingBox[];
    rawAnnotation?: unknown;
  },
): Promise<void> {
  await db
    .insert(ocrRuns)
    .values({
      analysisId: args.analysisId,
      imageUrl: args.imageUrl,
      imageUrlHash: args.imageUrlHash,
      parsedText: args.parsedText,
      meanConfidence: args.meanConfidence ?? null,
      boundingBoxesJson: args.boundingBoxes ?? [],
      rawAnnotationJson: args.rawAnnotation ?? null,
      visionModelVersion: VISION_MODEL_VERSION,
    })
    .onConflictDoUpdate({
      target: [ocrRuns.imageUrlHash, ocrRuns.visionModelVersion],
      set: {
        analysisId: args.analysisId,
        imageUrl: args.imageUrl,
        parsedText: args.parsedText,
        meanConfidence: args.meanConfidence ?? null,
        boundingBoxesJson: args.boundingBoxes ?? [],
        rawAnnotationJson: args.rawAnnotation ?? null,
      },
    });
}
